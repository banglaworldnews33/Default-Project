-- -----------------------------------------------------
-- Phase 24: seller balances + financial read layer
-- (derived reads only; no writes, no balances stored,
-- no withdrawals, payouts, or refunds)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Phase 23 created the immutable earning ledger, but no
-- read surface exists: dashboards cannot show balances and
-- sellers cannot inspect their history. This migration adds
-- read-only, database-derived financial RPCs WITHOUT
-- creating any stored balance, withdrawal, payout, or
-- refund machinery (all future phases):
--
-- - get_seller_financial_summary() — own totals + clearing
-- - get_seller_ledger(...) — own keyset-paginated history
-- - get_admin_financial_summary() — platform aggregates
-- - get_admin_seller_financials(...) — per-seller aggregates
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No tables, columns, indexes, triggers, or RLS changes.
-- - No stored seller balance anywhere (profiles/sellers
--   untouched; balances derive from ledger rows only).
-- - No ledger INSERT/UPDATE/DELETE paths (017 rules stand).
-- - No withdrawals, payouts, refunds, reversals, payment
--   verification changes, or commission rule changes.
-- - No change to 001-017 objects (policies, triggers, RPCs,
--   grants on existing objects are byte-for-byte preserved).
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- MONEY RULE: numeric(12,2) throughout; aggregation happens
-- here, never in the browser. Clearing uses server time
-- (now()); browser time is never consulted.
--
-- CLEARING RULE (approved: 7 days): an earning is pending
-- while created_at > now() - interval '7 days', available
-- otherwise. No mutable flag exists; status derives per row.
-- Withdrawals do not exist yet, so available equals cleared
-- earnings. Future withdrawal/payout/refund entry types will
-- be subtracted by their own phases; totals below scope to
-- entry_type = 'earning' explicitly so later types cannot
-- silently corrupt them.
--
-- CURRENCY RULE: the marketplace is BDT-only (CHECKed on the
-- ledger). Summaries group by currency so a future currency
-- can never be silently merged; today that yields the single
-- BDT row. Zero rows means no data or no authorization —
-- never a fabricated zero.
--
-- Apply AFTER 001-017, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: get_seller_financial_summary() — own derived totals
-- ============================================================
-- Read-only DEFINER RPC. Seller identity is auth.uid() only;
-- no seller_id parameter exists. The verified-seller check
-- mirrors the seller RLS predicate (role + verification).
-- Non-sellers and anonymous callers match zero rows — never
-- an error that oracles the role, never a fabricated zero.

create or replace function public.get_seller_financial_summary()
returns table (
  total_earnings numeric,
  total_commission numeric,
  pending_earnings numeric,
  available_balance numeric,
  currency text,
  earning_count bigint,
  last_earning_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount), 0),
         coalesce(sum(l.commission_amount), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at <= now() - interval '7 days'), 0),
         l.currency,
         count(*),
         max(l.created_at)
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  where l.seller_id = auth.uid()
    and l.entry_type = 'earning'
    and p.role = 'seller'
    and p.verification_status = 'verified'
  group by l.currency;
$$;

revoke all on function public.get_seller_financial_summary() from public, anon, service_role;
grant execute on function public.get_seller_financial_summary() to authenticated;

-- ============================================================
-- STEP 2: get_seller_ledger(...) — own keyset-paginated history
-- ============================================================
-- Same ownership model as STEP 1. Each row carries a
-- server-derived clearing_status (pending/available computed
-- against now()); the frontend never computes status from
-- browser time. order_number is the safe customer-independent
-- reference — no customer PII, payment secrets, or admin
-- metadata is selected. Deterministic keyset ordering
-- (created_at DESC, id DESC); no offset pagination.

create or replace function public.get_seller_ledger(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null
)
returns table (
  entry_id uuid,
  entry_type text,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  gross_amount numeric,
  commission_rate numeric,
  commission_amount numeric,
  net_amount numeric,
  currency text,
  clearing_status text,
  created_at timestamp with time zone,
  source text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select l.id, l.entry_type, l.order_id, o.order_number, l.order_item_id,
         l.gross_amount, l.commission_rate, l.commission_amount, l.net_amount,
         l.currency,
         case when l.created_at > now() - interval '7 days'
              then 'pending' else 'available' end,
         l.created_at, l.source
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  left join public.orders o on o.id = l.order_id
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_created_before is null
         or p_id_before is null
         or (l.created_at, l.id) < (p_created_before, p_id_before))
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_ledger(integer, timestamp with time zone, uuid) from public, anon, service_role;
grant execute on function public.get_seller_ledger(integer, timestamp with time zone, uuid) to authenticated;

-- ============================================================
-- STEP 3: get_admin_financial_summary() — platform aggregates
-- ============================================================
-- Read-only DEFINER RPC gated on the existing is_admin()
-- mechanism (normal admins included, consistent with the 015
-- admin order reads; commission configuration stays
-- super-admin-only and untouched). Aggregates only — no
-- per-seller rows, no customer data, no secrets. Non-admins
-- match zero rows. GROUP BY currency keeps future currencies
-- unmerged; zero rows is never a fabricated zero.

create or replace function public.get_admin_financial_summary()
returns table (
  total_earnings numeric,
  total_commission numeric,
  pending_earnings numeric,
  available_earnings numeric,
  earning_count bigint,
  sellers_with_earnings bigint,
  currency text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount), 0),
         coalesce(sum(l.commission_amount), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at <= now() - interval '7 days'), 0),
         count(*),
         count(distinct l.seller_id),
         l.currency
  from public.ledger_entries l
  where l.entry_type = 'earning'
    and public.is_admin()
  group by l.currency;
$$;

revoke all on function public.get_admin_financial_summary() from public, anon, service_role;
grant execute on function public.get_admin_financial_summary() to authenticated;

-- ============================================================
-- STEP 4: get_admin_seller_financials(...) — per-seller aggregates
-- ============================================================
-- Same gate as STEP 3. One row per seller with a shop-name
-- join (shop names are already public on the marketplace, so
-- no new exposure). No customer PII, no per-order detail.
-- Deterministic seller_id ordering with a UUID cursor
-- (stable under concurrent inserts, unlike offsets).

create or replace function public.get_admin_seller_financials(
  p_limit integer default 25,
  p_seller_before uuid default null
)
returns table (
  seller_id uuid,
  shop_name text,
  total_earnings numeric,
  pending_earnings numeric,
  available_earnings numeric,
  total_commission numeric,
  earning_count bigint,
  currency text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select l.seller_id,
         s.shop_name,
         coalesce(sum(l.net_amount), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.created_at <= now() - interval '7 days'), 0),
         coalesce(sum(l.commission_amount), 0),
         count(*),
         l.currency
  from public.ledger_entries l
  left join public.seller_shops s on s.seller_id = l.seller_id
  where l.entry_type = 'earning'
    and public.is_admin()
    and (p_seller_before is null or l.seller_id > p_seller_before)
  group by l.seller_id, s.shop_name, l.currency
  order by l.seller_id asc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_seller_financials(integer, uuid) from public, anon, service_role;
grant execute on function public.get_admin_seller_financials(integer, uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Four new read-only RPCs, STABLE + LANGUAGE sql +
--   SECURITY DEFINER + fixed search_path (public, pg_temp).
-- - Seller reads scoped by auth.uid() + verified-seller
--   predicate; admin reads gated by is_admin(); customers
--   and anonymous match zero rows everywhere.
-- - Clearing derived per row/aggregate from created_at vs
--   now() - 7 days; no flags, no browser time, no stored
--   balances (none created anywhere in this migration).
-- - Totals scope to entry_type = 'earning' so future payout/
--   refund types cannot corrupt them; GROUP BY currency
--   keeps currencies unmerged.
-- - Keyset pagination (015 pattern); no offsets; clamped
--   limits; minimal whitelisted columns; no PII, no
--   secrets, no SELECT *; no dynamic SQL.
-- - 001-017 objects untouched (new function names only);
--   no tables, columns, indexes, triggers, RLS, or grant
--   changes to existing objects; EXECUTE to authenticated
--   with in-function gates throughout.
-- -----------------------------------------------------
