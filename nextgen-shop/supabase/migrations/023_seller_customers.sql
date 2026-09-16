-- -----------------------------------------------------
-- Phase 23: seller customer directory (local only)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Sellers today have NO customer directory: SellerCustomersPage
-- is a static placeholder. Order-level contact/address data is
-- reachable only per seller-owned order via
-- get_seller_order_detail() (013); there is no minimal,
-- seller-scoped customer summary. This migration adds exactly
-- one read-only RPC for that summary WITHOUT touching any
-- existing object:
--
-- - get_seller_customers() — own customers derived from
--   existing orders/order_items, keyset-paginated, with
--   optional server-side search.
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No new tables. No duplicate customer table, no PII copies.
--   Customer identity is orders.customer_id -> profiles.id
--   (verified in 012, line 78); snapshots come from the
--   authoritative order rows.
-- - No change to 001-022 objects (tables, policies, triggers,
--   RPCs, grants on existing objects are byte-for-byte preserved).
--   In particular financial migrations 017-021 are untouched.
-- - No RLS policy changes. No table GRANT changes: the existing
--   owner-scoped SELECT policies on orders/order_items stay
--   exactly as they are; the RPC bypasses RLS as owner (same as
--   013/014/022 reads).
-- - No email, address, payment, credential, or unrelated profile
--   field is selected anywhere below. Address/contact detail
--   stays exclusively in get_seller_order_detail() (013).
-- - No INSERT/UPDATE/DELETE path. No service_role frontend use.
-- - No seed/demo data.
--
-- AUTHORITY MODEL (mirrors 013/022 precedent):
-- - Grants decide reachability; the RPC predicate decides
--   visibility; seller identity is auth.uid() only.
-- - No seller_id parameter exists by construction.
-- - Search/filters narrow the already seller-authorized set;
--   they are never authorization.
--
-- Apply AFTER 001-022, in order. Idempotent in style.
-- LOCAL ONLY: do not db push without explicit authorization.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: get_seller_customers() — own customer directory
-- ============================================================
-- Read-only DEFINER RPC (verified sellers only). A "customer of
-- this seller" is defined strictly as: a profiles identity that
-- owns at least one order containing at least one order_item
-- with seller_id = auth.uid(). Ownership is proven by the join
-- itself — callers with no sales match zero rows, and forged
-- filters only narrow within the caller's own set (no oracle).
--
-- Per-customer snapshot choice: orders carry per-order
-- customer_name/mobile snapshots that may legitimately differ
-- across orders (buyer edits details between checkouts). The
-- directory shows the LATEST order's snapshot (deterministic
-- DISTINCT ON: created_at DESC, order id DESC), never a mix.
-- No profiles join for identity data: email and unrelated
-- profile fields can therefore never widen this surface.
--
-- Search uses strpos() (substring, case-insensitive via
-- lower()) instead of LIKE precisely to avoid LIKE-wildcard
-- escaping bugs: there is no ESCAPE clause to get wrong and no
-- backslash literal to misinterpret. Overlong input (>120
-- chars) fails closed to zero rows; blank input disables the
-- filter. Keyset + limit clamp follow the 021/022 convention
-- byte-for-byte in spirit.

create or replace function public.get_seller_customers(
  p_limit integer default 25,
  p_cursor_at timestamp with time zone default null,
  p_cursor_id uuid default null,
  p_search text default null
)
returns table (
  customer_id uuid,
  customer_name text,
  customer_mobile text,
  total_orders_with_this_seller bigint,
  total_items_with_this_seller bigint,
  last_order_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  with seller_orders as (
    select distinct o.id as order_id, o.customer_id, o.created_at
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.seller_id = auth.uid()
  ),
  seller_stats as (
    select o.customer_id,
           count(distinct o.id) as order_count,
           count(*) as item_count
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.seller_id = auth.uid()
    group by o.customer_id
  ),
  latest as (
    select distinct on (so.customer_id)
      so.customer_id, o.customer_name, o.mobile, so.created_at as last_order_at
    from seller_orders so
    join public.orders o on o.id = so.order_id
    order by so.customer_id, so.created_at desc, so.order_id desc
  )
  select l.customer_id, l.customer_name, l.mobile,
         s.order_count, s.item_count, l.last_order_at
  from latest l
  join seller_stats s on s.customer_id = l.customer_id
  join public.profiles v on v.id = auth.uid()
  where v.role = 'seller'
    and v.verification_status = 'verified'
    and (p_cursor_at is null
         or p_cursor_id is null
         or (l.last_order_at, l.customer_id) < (p_cursor_at, p_cursor_id))
    and (nullif(btrim(coalesce(p_search, '')), '') is null
         or (char_length(p_search) <= 120
             and (strpos(lower(l.customer_name), lower(p_search)) > 0
                  or strpos(lower(l.mobile), lower(p_search)) > 0)))
  order by l.last_order_at desc, l.customer_id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_customers(integer, timestamp with time zone, uuid, text) from public, anon, service_role;
grant execute on function public.get_seller_customers(integer, timestamp with time zone, uuid, text) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - get_seller_customers(): verified-seller gate, ownership via
--   order_items.seller_id = auth.uid(), identity via
--   orders.customer_id, latest-snapshot PII (name/mobile only),
--   per-seller order/item counts, tuple keyset + clamped limit,
--   strpos server-side search (name/mobile only, fail-closed),
--   no oracle, no SELECT *.
-- - No tables, columns, indexes, triggers, policies, or grants
--   on existing objects touched. EXECUTE to authenticated only;
--   PUBLIC/anon/service_role explicitly revoked. No dynamic SQL.
--   Fixed search_path on the definer function.
-- -----------------------------------------------------
