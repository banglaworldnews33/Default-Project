-- -----------------------------------------------------
-- Phase 16: admin real-order visibility (read-only RPCs;
--           no schema, RLS, or existing-object changes)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Migration 012 created orders/order_items with admin-read SELECT
-- policies, but no minimal admin read API exists: direct SELECT *
-- would expose internal identifiers and relies on every future
-- query to keep that discipline. Sellers got fulfillment reads in
-- 013 and customers got history reads in 014; admins — who must
-- oversee real marketplace orders — still have no real-order
-- surface (the admin dashboard reads demo localStorage only).
-- This migration adds the smallest auditable read surface for
-- admin order oversight, mirroring the proven 013/014 pattern:
--
-- - get_admin_orders(...) — all real orders, keyset-paginated,
--   one row per order with aggregates
-- - get_admin_order_detail(p_order_id) — one real order slice,
--   one row per order item with header + item snapshots
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No tables, columns, indexes, triggers, or RLS changes.
-- - No change to 001-014 objects (tables, policies, triggers,
--   RPCs, grants on existing objects are byte-for-byte preserved).
-- - No INSERT/UPDATE/DELETE grants or policies anywhere.
-- - No admin status changes, seller fulfillment changes,
--   customer cancellation, refunds, payment verification,
--   gateway logic, coupons, commissions, payouts, reviews,
--   returns, complaints, or notifications.
-- - No payment state changes; payment_method/payment_status are
--   returned read-only exactly as stored by 012.
-- - No service_role frontend use. No dynamic SQL.
--
-- Apply AFTER 001-014, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: get_admin_orders(...) — keyset-paginated admin list
-- ============================================================
-- Read-only DEFINER RPC. The caller proves nothing except a
-- valid session: admin authorization (public.is_admin(), itself
-- a recursion-safe DEFINER helper over auth.uid()) is enforced
-- HERE in SQL as a row predicate. Non-admin and anonymous
-- callers match zero rows — no oracle, no error text that
-- distinguishes roles. No admin_id/role/customer_id/seller_id
-- parameter exists, so no client-supplied identity can be
-- trusted or smuggled in. order_number is display-only, never
-- the authorization boundary.
--
-- Cursor contract (all parameters optional, all defaulted):
-- - p_limit integer (default 25): page size, clamped
--   server-side to [1, 100]. NULL, zero, and negative values
--   fail closed to the default/clamp — never to unlimited.
-- - p_created_before timestamptz (default NULL) +
--   p_id_before uuid (default NULL): keyset cursor taken from
--   the last row of the previous page. BOTH must be non-NULL
--   for the cursor to apply; a half-provided cursor is ignored
--   and the first page is returned (fail closed to the start,
--   never skipping rows).
-- Ordering is deterministic: created_at DESC, id DESC, and the
-- cursor predicate uses the matching row comparison, so pages
-- are stable under concurrent inserts (offset pagination is
-- deliberately NOT used: it skips/duplicates under concurrent
-- order creation).

create or replace function public.get_admin_orders(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null
)
returns table (
  order_id uuid,
  order_number text,
  created_at timestamp with time zone,
  order_status text,
  payment_method text,
  payment_status text,
  subtotal numeric,
  delivery_charge numeric,
  discount numeric,
  total numeric,
  delivery_zone text,
  item_count bigint,
  total_quantity bigint
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select o.id, o.order_number, o.created_at, o.order_status,
         o.payment_method, o.payment_status,
         o.subtotal, o.delivery_charge, o.discount, o.total,
         o.delivery_zone,
         count(i.id),
         coalesce(sum(i.quantity), 0)
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  where public.is_admin()
    and (p_created_before is null
         or p_id_before is null
         or (o.created_at, o.id) < (p_created_before, p_id_before))
  group by o.id, o.order_number, o.created_at, o.order_status,
           o.payment_method, o.payment_status,
           o.subtotal, o.delivery_charge, o.discount, o.total,
           o.delivery_zone
  order by o.created_at desc, o.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_orders(integer, timestamp with time zone, uuid) from public, anon, service_role;
grant execute on function public.get_admin_orders(integer, timestamp with time zone, uuid) to authenticated;

-- ============================================================
-- STEP 2: get_admin_order_detail(p_order_id) — one order slice
-- ============================================================
-- Same guarantees as STEP 1, restricted to a single order, one
-- row per order item (header fields repeated per row for a
-- simple client render). Callers without admin authorization —
-- or with a nonexistent/foreign order id — receive zero rows,
-- indistinguishable from one another: no ownership oracle, no
-- role oracle. The URL-supplied order id is never trusted as
-- authorization. The delivery snapshot is included because
-- order oversight is an operational admin function; it is the
-- same minimum already approved for the customer detail RPC in
-- 014. No internal identifiers (customer_id, seller_id, shop_id,
-- product_id, variant_id), no auth secrets, no payment secrets,
-- no audit internals, no admin identity beyond the caller's own
-- already-known session.

create or replace function public.get_admin_order_detail(p_order_id uuid)
returns table (
  order_id uuid,
  order_number text,
  created_at timestamp with time zone,
  order_status text,
  payment_method text,
  payment_status text,
  subtotal numeric,
  delivery_charge numeric,
  discount numeric,
  total numeric,
  delivery_zone text,
  customer_name text,
  customer_mobile text,
  address_line text,
  division text,
  district text,
  upazila text,
  postal_code text,
  order_notes text,
  product_name text,
  sku text,
  variant_name text,
  variant_attributes jsonb,
  quantity integer,
  unit_price numeric,
  line_subtotal numeric,
  fulfillment_status text,
  item_created_at timestamp with time zone,
  item_updated_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select o.id, o.order_number, o.created_at, o.order_status,
         o.payment_method, o.payment_status,
         o.subtotal, o.delivery_charge, o.discount, o.total,
         o.delivery_zone,
         o.customer_name, o.mobile, o.address,
         o.division, o.district, o.upazila,
         o.postal_code, o.order_notes,
         i.product_name, i.sku, i.variant_name, i.variant_attributes,
         i.quantity, i.unit_price, i.line_subtotal,
         i.fulfillment_status, i.created_at, i.updated_at
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where o.id = p_order_id
    and public.is_admin()
  order by i.created_at asc, i.id asc;
$$;

revoke all on function public.get_admin_order_detail(uuid) from public, anon, service_role;
grant execute on function public.get_admin_order_detail(uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Two new read-only RPCs, STABLE + LANGUAGE sql +
--   SECURITY DEFINER + fixed search_path (public, pg_temp).
-- - Admin authorization enforced inside SQL via
--   public.is_admin() as a row predicate (zero rows for
--   non-admin/anon — no oracle); no role/admin/customer/
--   seller parameters exist by construction.
-- - Keyset pagination (created_at DESC, id DESC) with
--   server-clamped limit [1, 100]; half-cursors fail closed
--   to the first page; no offset pagination.
-- - Minimal whitelisted columns; no SELECT *; no dynamic SQL;
--   no internal IDs, auth/payment secrets, or audit internals.
-- - EXECUTE to authenticated only; PUBLIC/anon/service_role
--   explicitly revoked. No table grants or RLS touched.
-- - 001-014 objects untouched (new function names only).
-- -----------------------------------------------------
