-- -----------------------------------------------------
-- Phase 27: financial reporting foundation (read-only
-- aggregates, date filtering, keyset pagination)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- The immutable ledger (017/023), reservations and payouts
-- (019/025), and refunds/reversals (020/026) all record
-- money, but no date-bounded reporting surface exists: the
-- Phase 24 summaries are lifetime-only, and row listings
-- cannot be filtered by period. This migration adds a
-- read-only reporting layer WITHOUT moving money, changing
-- business rules, or touching any existing behavior:
--
-- - get_seller_finance_report(...) — own period flows plus
--   current point-in-time balances
-- - get_admin_finance_report(...) — platform period flows
-- - date bounds on get_seller_ledger, get_seller_withdrawals,
--   and get_admin_refunds (appended parameters only)
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No tables, columns, indexes, triggers, or RLS changes.
-- - No ledger INSERT/UPDATE/DELETE paths (append-only stands).
-- - No commission, refund, withdrawal, payout, verification,
--   or balance-rule changes of any kind.
-- - No change to 001-020 files; existing RPCs are superseded
--   here via CREATE OR REPLACE (011 pattern) with appended
--   parameters only — existing callers keep working.
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- ACCOUNTING DEFINITIONS (enforced below, never in the browser):
-- - gross_earnings: SUM(net_amount) over 'earning' rows.
-- - total_commission: SUM(commission_amount) over earnings.
-- - refunded_amount: -SUM(amount) over 'refund' rows (>= 0).
-- - adjustment_amount: signed SUM over 'adjustment' rows.
-- - net_earnings: gross + refund legs + adjustment legs.
--   Reservation, release, and payout legs are EXCLUDED on
--   purpose: net measures earning performance, not cash.
-- - paid_out_amount: -SUM(amount) over 'payout' rows (>= 0).
-- - reserved_amount / available_balance: point-in-time values
--   using the live 019/024 definitions (active requests;
--   cleared earnings plus every non-earning leg).
-- - debt_amount: max(-available_balance, 0) — the explicit
--   negative-position figure, >= 0, zero when healthy.
--
-- PERIOD SEMANTICS: p_from/p_to bound FLOW totals and counts
-- by ledger created_at only. Balances (available, reserved,
-- debt) are always current point-in-time values — a period
-- cannot rewind a balance, and the RPC never pretends it
-- does. NULL bounds mean unbounded. An inverted range
-- (from > to) matches zero rows (fail closed, consistent
-- with the zero-row conventions, never an error oracle).
--
-- CURRENCY RULE: aggregates group by currency so a future
-- currency can never be silently merged; today that yields
-- the single BDT row. Zero rows means no data or no
-- authorization — never a fabricated zero.
--
-- Apply AFTER 001-020, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: get_seller_finance_report(...) — own period report
-- ============================================================
-- Read-only DEFINER RPC. Seller identity is auth.uid() only;
-- no seller_id parameter exists. The verified-seller check
-- mirrors the seller RLS predicate. Non-sellers and
-- anonymous callers match zero rows.

create or replace function public.get_seller_finance_report(
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  gross_earnings numeric,
  total_commission numeric,
  refunded_amount numeric,
  adjustment_amount numeric,
  net_earnings numeric,
  paid_out_amount numeric,
  reserved_amount numeric,
  available_balance numeric,
  debt_amount numeric,
  earning_count bigint,
  refund_count bigint,
  currency text,
  period_from timestamp with time zone,
  period_to timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.commission_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(-sum(l.amount) filter (
           where l.entry_type = 'refund'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.amount) filter (
           where l.entry_type = 'adjustment'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type in ('refund', 'adjustment')
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(-sum(l.amount) filter (
           where l.entry_type = 'payout'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce((
           select sum(w.amount)
           from public.withdrawal_requests w
           where w.seller_id = auth.uid()
             and w.status in ('pending', 'approved', 'processing')
         ), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at <= now() - interval '7 days'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type <> 'earning'), 0),
         greatest(-(
           coalesce(sum(l.net_amount) filter (
             where l.entry_type = 'earning'
               and l.created_at <= now() - interval '7 days'), 0)
           + coalesce(sum(l.amount) filter (
             where l.entry_type <> 'earning'), 0)
         ), 0),
         count(*) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)),
         count(*) filter (
           where l.entry_type = 'refund'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)),
         l.currency,
         p_from,
         p_to
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_from is null or p_to is null or p_from <= p_to)
  group by l.currency;
$$;

revoke all on function public.get_seller_finance_report(timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_seller_finance_report(timestamp with time zone, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 2: get_admin_finance_report(...) — platform period report
-- ============================================================
-- Read-only DEFINER RPC gated on the existing is_admin()
-- mechanism (normal admins included, consistent with the 015
-- admin order reads and 018/024 admin summaries). Aggregates
-- only — no per-seller rows, no customer data, no secrets.
-- sellers_with_activity counts distinct sellers holding any
-- ledger row in the period. Non-admins match zero rows.

create or replace function public.get_admin_finance_report(
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  gross_earnings numeric,
  total_commission numeric,
  refunded_amount numeric,
  adjustment_amount numeric,
  net_earnings numeric,
  paid_out_amount numeric,
  reserved_amount numeric,
  available_earnings numeric,
  debt_amount numeric,
  earning_count bigint,
  sellers_with_activity bigint,
  currency text,
  period_from timestamp with time zone,
  period_to timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.commission_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(-sum(l.amount) filter (
           where l.entry_type = 'refund'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.amount) filter (
           where l.entry_type = 'adjustment'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type in ('refund', 'adjustment')
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce(-sum(l.amount) filter (
           where l.entry_type = 'payout'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)), 0),
         coalesce((
           select sum(w.amount)
           from public.withdrawal_requests w
           where w.status in ('pending', 'approved', 'processing')
         ), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at <= now() - interval '7 days'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type <> 'earning'), 0),
         greatest(-(
           coalesce(sum(l.net_amount) filter (
             where l.entry_type = 'earning'
               and l.created_at <= now() - interval '7 days'), 0)
           + coalesce(sum(l.amount) filter (
             where l.entry_type <> 'earning'), 0)
         ), 0),
         count(*) filter (
           where l.entry_type = 'earning'
             and (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)),
         count(distinct l.seller_id) filter (
           where (p_from is null or l.created_at >= p_from)
             and (p_to is null or l.created_at <= p_to)),
         l.currency,
         p_from,
         p_to
  from public.ledger_entries l
  where public.is_admin()
    and (p_from is null or p_to is null or p_from <= p_to)
  group by l.currency;
$$;

revoke all on function public.get_admin_finance_report(timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_admin_finance_report(timestamp with time zone, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 3: date bounds on row listings (appended parameters only)
-- ============================================================
-- get_seller_ledger, get_seller_withdrawals, and
-- get_admin_refunds each gain p_from/p_to with NULL defaults,
-- so every existing caller keeps working byte-for-byte.
-- Bounds filter created_at server-side; inverted ranges match
-- zero rows (fail closed). Ordering, limits, cursors, and
-- grants are otherwise unchanged.
--
-- The superseded 3-/4-argument overloads are dropped so only
-- one signature exists per RPC (avoids overloaded-RPC
-- ambiguity; the new signatures are backward compatible via
-- defaults).

drop function if exists public.get_seller_ledger(integer, timestamp with time zone, uuid);
drop function if exists public.get_seller_withdrawals(integer, timestamp with time zone, uuid);
drop function if exists public.get_admin_refunds(integer, timestamp with time zone, uuid, text);

create or replace function public.get_seller_ledger(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
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
  source text,
  reverses_entry_id uuid,
  amount numeric
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select l.id, l.entry_type, l.order_id, o.order_number, l.order_item_id,
         l.gross_amount, l.commission_rate, l.commission_amount, l.net_amount,
         l.currency,
         case when l.created_at > now() - interval '7 days'
              then 'pending' else 'available' end,
         l.created_at, l.source, l.reverses_entry_id, l.amount
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  left join public.orders o on o.id = l.order_id
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
    and (p_created_before is null
         or p_id_before is null
         or (l.created_at, l.id) < (p_created_before, p_id_before))
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_ledger(integer, timestamp with time zone, uuid, timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_seller_ledger(integer, timestamp with time zone, uuid, timestamp with time zone, timestamp with time zone) to authenticated;

create or replace function public.get_seller_withdrawals(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  withdrawal_id uuid,
  amount numeric,
  currency text,
  status text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  processing_at timestamp with time zone,
  completed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  failed_at timestamp with time zone,
  rejection_reason text,
  failure_reason text,
  external_reference text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select w.id, w.amount, w.currency, w.status, w.created_at,
         w.approved_at, w.processing_at, w.completed_at,
         w.rejected_at, w.failed_at,
         w.rejection_reason, w.failure_reason, w.external_reference
  from public.withdrawal_requests w
  join public.profiles p on p.id = auth.uid()
  where w.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_from is null or w.created_at >= p_from)
    and (p_to is null or w.created_at <= p_to)
    and (p_created_before is null
         or p_id_before is null
         or (w.created_at, w.id) < (p_created_before, p_id_before))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_withdrawals(integer, timestamp with time zone, uuid, timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_seller_withdrawals(integer, timestamp with time zone, uuid, timestamp with time zone, timestamp with time zone) to authenticated;

create or replace function public.get_admin_refunds(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_status text default null,
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  refund_id uuid,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  seller_id uuid,
  shop_name text,
  requested_net_amount numeric,
  currency text,
  status text,
  reason text,
  rejection_reason text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  processed_at timestamp with time zone,
  rejected_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.order_id, o.order_number, r.order_item_id,
         r.seller_id, s.shop_name, r.requested_net_amount, r.currency,
         r.status, r.reason, r.rejection_reason, r.created_at,
         r.approved_at, r.processed_at, r.rejected_at
  from public.refund_requests r
  left join public.orders o on o.id = r.order_id
  left join public.seller_shops s on s.seller_id = r.seller_id
  where public.is_admin()
    and (p_status is null
         or (p_status in ('pending', 'approved', 'rejected', 'processed')
             and r.status = p_status))
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at <= p_to)
    and (p_created_before is null
         or p_id_before is null
         or (r.created_at, r.id) < (p_created_before, p_id_before))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_refunds(integer, timestamp with time zone, uuid, text, timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_admin_refunds(integer, timestamp with time zone, uuid, text, timestamp with time zone, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 4: get_admin_reconciliation() — detect-only exceptions
-- ============================================================
-- Read-only DEFINER RPC gated on the existing is_admin()
-- mechanism (operational visibility consistent with the 018
-- admin reads; no new PII beyond seller/order/item/ledger
-- UUIDs and amounts already visible there — no reasons,
-- names, customer data, or actor identity selected).
-- Non-admins match zero rows. No parameters, hence no
-- injection surface and no seller-ID smuggling: every
-- branch scans authoritatively and reports what it finds.
--
-- Each branch detects exactly one invariant violation from
-- the 017-020 accounting model. The function NEVER writes:
-- no INSERT/UPDATE/DELETE anywhere below, STABLE, static
-- SQL only. A deliberately inconsistent relationship
-- appears here as a row; correction still flows exclusively
-- through the 020 super-admin adjustment path. Zero rows
-- means no detectable inconsistency — never a fabricated
-- clean bill beyond these ten checks.
--
-- Division safety: the commission recomputation branch only
-- evaluates rows whose original earning net is non-null and
-- non-zero (017/020 invariant N > 0); malformed earnings are
-- caught by the formula branches instead, so no
-- divide-by-zero can abort the scan.

create or replace function public.get_admin_reconciliation()
returns table (
  exception_type text,
  severity text,
  seller_id uuid,
  order_id uuid,
  order_item_id uuid,
  ledger_entry_id uuid,
  related_entry_id uuid,
  expected_value text,
  actual_value text,
  detail text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  -- E1: earning legs must carry amount = net_amount.
  select 'earning_amount_mismatch'::text, 'high'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, null::uuid,
         l.net_amount::text, l.amount::text,
         'earning leg amount must equal its net_amount'::text
  from public.ledger_entries l
  where l.entry_type = 'earning'
    and l.amount is distinct from l.net_amount
    and public.is_admin()
  union all
  -- E2: earning net must equal gross - commission - discount.
  select 'earning_net_formula_mismatch'::text, 'high'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, null::uuid,
         (l.gross_amount - l.commission_amount - l.discount_amount)::text,
         l.net_amount::text,
         'earning net must equal gross - commission - discount'::text
  from public.ledger_entries l
  where l.entry_type = 'earning'
    and l.net_amount is distinct from
        (l.gross_amount - l.commission_amount - l.discount_amount)
    and public.is_admin()
  union all
  -- E3: every refund leg must link its original earning.
  select 'refund_without_earning_link'::text, 'high'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, null::uuid,
         'reverses_entry_id set'::text, 'null'::text,
         'refund leg must reference the compensated earning'::text
  from public.ledger_entries l
  where l.entry_type = 'refund'
    and l.reverses_entry_id is null
    and public.is_admin()
  union all
  -- E4: cumulative refunds per earning must not exceed its net.
  select 'refund_exceeds_earning'::text, 'critical'::text,
         e.seller_id, e.order_id, e.order_item_id, e.id, null::uuid,
         ('refunded <= ' || e.net_amount::text)::text,
         (select coalesce(-sum(r.amount), 0)
          from public.ledger_entries r
          where r.reverses_entry_id = e.id
            and r.entry_type = 'refund')::text,
         'refunds against one earning must not exceed its net'::text
  from public.ledger_entries e
  where e.entry_type = 'earning'
    and e.net_amount is not null
    and (select coalesce(-sum(r.amount), 0)
         from public.ledger_entries r
         where r.reverses_entry_id = e.id
           and r.entry_type = 'refund') > e.net_amount
    and public.is_admin()
  union all
  -- E5: refund commission share must match the original snapshot
  -- (C' = floor(C * R / N * 100 + 0.5) / 100, R = -refund amount).
  select 'refund_commission_mismatch'::text, 'high'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, l.reverses_entry_id,
         (floor(e.commission_amount * (-l.amount) / e.net_amount * 100 + 0.5) / 100)::text,
         l.commission_amount::text,
         'refund commission must derive from the original earning snapshot'::text
  from public.ledger_entries l
  join public.ledger_entries e on e.id = l.reverses_entry_id
  where l.entry_type = 'refund'
    and l.reverses_entry_id is not null
    and e.net_amount is not null
    and e.net_amount <> 0
    and l.commission_amount is distinct from
        ((floor(e.commission_amount * (-l.amount) / e.net_amount * 100 + 0.5) / 100)::numeric(12, 2))
    and public.is_admin()
  union all
  -- E6: active withdrawals must hold a reservation leg.
  select 'active_withdrawal_without_reservation'::text, 'high'::text,
         w.seller_id, null::uuid, null::uuid, null::uuid, null::uuid,
         ('reservation:' || w.id::text)::text, 'missing'::text,
         'pending/approved/processing withdrawals must hold a reservation leg'::text
  from public.withdrawal_requests w
  where w.status in ('pending', 'approved', 'processing')
    and not exists (
      select 1 from public.ledger_entries l
      where l.reference_key = 'reservation:' || w.id::text
    )
    and public.is_admin()
  union all
  -- E7: terminal withdrawals must hold their settlement legs
  -- (rejected/failed: release; completed: release + payout).
  select 'terminal_withdrawal_without_settlement'::text, 'high'::text,
         w.seller_id, null::uuid, null::uuid, null::uuid, null::uuid,
         case when w.status = 'completed' then 'release + payout'::text
              else 'release'::text end,
         'missing'::text,
         'terminal withdrawals must hold their compensating legs'::text
  from public.withdrawal_requests w
  where ((w.status in ('rejected', 'failed')
          and not exists (
            select 1 from public.ledger_entries l
            where l.reference_key = 'release:' || w.id::text
          ))
         or (w.status = 'completed'
             and (not exists (
                    select 1 from public.ledger_entries l
                    where l.reference_key = 'release:' || w.id::text
                  )
                  or not exists (
                    select 1 from public.ledger_entries l
                    where l.reference_key = 'payout:' || w.id::text
                  ))))
    and public.is_admin()
  union all
  -- E8: admitted-but-never-written entry vocabulary must stay empty.
  select 'unexpected_entry_type'::text, 'medium'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, null::uuid,
         'no such legs'::text, l.entry_type,
         'entry type admitted by CHECK but written by no 017-020 path'::text
  from public.ledger_entries l
  where l.entry_type in ('commission', 'reversal', 'payout_reversal')
    and public.is_admin()
  union all
  -- E9: marketplace is BDT-only; anything else is an anomaly.
  select 'non_bdt_currency'::text, 'medium'::text,
         l.seller_id, l.order_id, l.order_item_id, l.id, null::uuid,
         'BDT'::text, l.currency,
         'ledger currency must be BDT'::text
  from public.ledger_entries l
  where l.currency is distinct from 'BDT'
    and public.is_admin()
  union all
  -- E10: refunded payment requires fully-refunded earnings AND
  -- terminal items (mirror of the process_refund flip rule).
  select 'refunded_payment_incomplete'::text, 'high'::text,
         null::uuid, o.id, null::uuid, null::uuid, null::uuid,
         'all earnings refunded + all items terminal'::text,
         'incomplete'::text,
         'refunded orders must have every earning fully refunded and every item delivered/cancelled'::text
  from public.orders o
  where o.payment_status = 'refunded'
    and (not exists (
           select 1 from public.ledger_entries e
           where e.order_id = o.id and e.entry_type = 'earning'
         )
         or exists (
           select 1 from public.ledger_entries e
           where e.order_id = o.id and e.entry_type = 'earning'
             and (e.net_amount is null
                  or e.net_amount - coalesce((
                    select -sum(a.amount) from public.ledger_entries a
                    where a.reverses_entry_id = e.id and a.entry_type = 'refund'
                  ), 0) > 0)
         )
         or exists (
           select 1 from public.order_items i
           where i.order_id = o.id
             and i.fulfillment_status not in ('delivered', 'cancelled')
         ))
    and public.is_admin()
  order by 1, 6, 4, 3;
$$;

revoke all on function public.get_admin_reconciliation() from public, anon, service_role;
grant execute on function public.get_admin_reconciliation() to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Two new period report RPCs (seller + platform): flows
--   bounded by created_at, balances always current, invalid
--   ranges fail closed to zero rows, GROUP BY currency.
-- - Three row listings gain appended p_from/p_to (existing
--   callers unaffected via defaults); superseded overloads
--   are dropped so exactly one signature exists per RPC.
-- - New detect-only get_admin_reconciliation(): ten static
--   exception checks over ledger/withdrawal/order state;
--   is_admin-gated per branch, zero writes, STABLE, no
--   PII beyond UUIDs/amounts admins already read; never
--   auto-repairs (corrections stay on the 020 adjustment
--   path); zero rows means no detectable inconsistency.
-- - STABLE + LANGUAGE sql + SECURITY DEFINER + fixed
--   search_path (public, pg_temp) throughout; auth.uid() and
--   is_admin() gates intact; no SELECT *; no dynamic SQL.
-- - 001-020 files untouched (new names + supersedes only).
-- -----------------------------------------------------
