-- -----------------------------------------------------
-- Phase 15A: customer order history reads (read-only RPCs;
--            no schema, RLS, or existing-object changes)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Migration 012 created orders/order_items with customer-own
-- SELECT policies, and create_order() lets an authenticated
-- customer create real orders. There is still NO minimal,
-- customer-safe read API: direct SELECT * would expose internal
-- identifiers (customer_id, seller_id, shop_id, product_id,
-- variant_id) to the browser and relies on every future query
-- to keep that discipline. This migration adds the smallest
-- auditable read surface for customer order history, mirroring
-- the proven 013 seller-read pattern:
--
-- - get_customer_orders() — own orders, one row per order
-- - get_customer_order_detail(p_order_id) — own order slice,
--   one row per order item with header + item snapshots
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No tables, columns, indexes, triggers, or RLS changes.
-- - No change to 001-013 objects (tables, policies, triggers,
--   RPCs, grants on existing objects are byte-for-byte preserved).
-- - No INSERT/UPDATE/DELETE grants or policies anywhere.
-- - No customer cancellation, payment verification/refunds,
--   reviews, complaints, returns, seller contact/payout data,
--   admin data, notifications, or tracking API.
-- - No payment state changes; payment_method/payment_status are
--   returned read-only exactly as stored by 012.
-- - No client limit/offset parameters (v1 returns the caller's
--   full own-order set; keyset pagination is a future RPC change
--   if volume ever requires it).
-- - No service_role frontend use. No dynamic SQL.
--
-- Apply AFTER 001-013, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: get_customer_orders() — own orders, minimal fields
-- ============================================================
-- Read-only DEFINER RPC. The caller proves nothing except a
-- valid session: ownership (orders.customer_id = auth.uid())
-- is enforced HERE in SQL. No customer_id parameter exists, so
-- no client-supplied identity can be trusted or smuggled in.
-- Anonymous callers (auth.uid() NULL) match zero rows.
-- Aggregates (item_count, total_quantity) derive from the
-- order's own order_items rows without exposing any
-- seller-specific ownership data. order_number is display-only,
-- never the authorization boundary.

create or replace function public.get_customer_orders()
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
  where o.customer_id = auth.uid()
  group by o.id, o.order_number, o.created_at, o.order_status,
           o.payment_method, o.payment_status,
           o.subtotal, o.delivery_charge, o.discount, o.total,
           o.delivery_zone
  order by o.created_at desc, o.id desc;
$$;

revoke all on function public.get_customer_orders() from public, anon, service_role;
grant execute on function public.get_customer_orders() to authenticated;

-- ============================================================
-- STEP 2: get_customer_order_detail(p_order_id) — own slice
-- ============================================================
-- Same guarantees as STEP 1, restricted to a single order, one
-- row per order item (header fields repeated per row for a
-- simple client render). Ownership is proven by the predicate
-- itself: callers with no matching own order receive zero rows,
-- indistinguishable from a nonexistent order — no ownership
-- oracle. The URL-supplied order id is never trusted as
-- authorization. The customer owns the complete order, so the
-- per-item seller fulfillment_status IS shown here (unlike the
-- seller RPCs, which redact the reverse direction). No internal
-- identifiers (customer_id, seller_id, shop_id, product_id,
-- variant_id), no admin identity, no audit content, no payment
-- secrets, no unrelated seller-private information.

create or replace function public.get_customer_order_detail(p_order_id uuid)
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
    and o.customer_id = auth.uid()
  order by i.created_at asc, i.id asc;
$$;

revoke all on function public.get_customer_order_detail(uuid) from public, anon, service_role;
grant execute on function public.get_customer_order_detail(uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Two new read-only RPCs, STABLE + LANGUAGE sql +
--   SECURITY DEFINER + fixed search_path (public, pg_temp).
-- - Ownership enforced inside SQL via
--   orders.customer_id = auth.uid() (+ orders.id = p_order_id
--   for detail); no customer_id/seller_id/totals/status
--   parameters exist by construction.
-- - Minimal whitelisted columns; no SELECT *; no dynamic SQL;
--   no internal IDs, admin/audit data, or payment secrets.
-- - EXECUTE to authenticated only; PUBLIC/anon/service_role
--   explicitly revoked. No table grants or RLS touched.
-- - 001-013 objects untouched (new function names only).
-- -----------------------------------------------------
