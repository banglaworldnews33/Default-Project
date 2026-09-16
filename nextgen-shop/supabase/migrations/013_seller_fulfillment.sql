-- -----------------------------------------------------
-- Phase 13: seller-specific order fulfillment (read RPCs +
--           item status workflow; no client writes)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Migration 012 created orders/order_items with a single
-- parent-level order_status and NO item-level status. Sellers can
-- read only their own item rows and cannot read parent orders at
-- all. That makes safe seller fulfillment impossible today:
-- writing parent order_status from a seller would misrepresent
-- other sellers' items, and no seller-scoped status field exists.
--
-- This migration adds the minimum for honest multi-seller
-- fulfillment WITHOUT touching the 012 customer/admin model:
--
-- - order_items.fulfillment_status + updated_at (per-seller stage)
-- - update_seller_fulfillment() RPC (ownership + transition
--   gated, parent aggregate recomputed in-transaction)
-- - get_seller_orders() / get_seller_order_detail() RPCs
--   (own items + minimal parent fulfillment fields only)
-- - admin_audit_log.order_id (nullable, no FK — 003 philosophy)
--   so fulfillment changes are audit-linked per order
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No change to 001-012 objects except ADDITIVE columns, one new
--   trigger, and new RPCs/policies-free grants (detailed below).
-- - No RLS policy changes at all: existing SELECT policies
--   already cover the new column (row-based); writes stay
--   RPC-only, so no UPDATE/INSERT/DELETE policies are added.
-- - No payment/commission/payout/coupon logic. No guest flows.
-- - No fulfillment for admins here (admin status RPCs remain a
--   future phase; admins keep read-only visibility).
-- - No backfill beyond the safe 'pending' default: pre-existing
--   rows get the initial stage, no invented history, no
--   financial/customer data touched.
-- - No DELETE policies anywhere. No service_role frontend use.
--
-- Apply AFTER 001-012, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: item fulfillment stage (+ updated_at trigger)
-- ============================================================
-- NOT NULL DEFAULT 'pending' backfills existing rows safely to
-- the initial stage. No NULLs (no three-state logic anywhere).

alter table public.order_items
  add column if not exists fulfillment_status text not null default 'pending'
    check (fulfillment_status in (
      'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'
    )),
  add column if not exists updated_at timestamp with time zone
    not null default now();

drop trigger if exists handle_order_items_updated_at on public.order_items;

create trigger handle_order_items_updated_at
  before update on public.order_items
  for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 2: audit order linkage (nullable, no FK)
-- ============================================================
-- Lets fulfillment audit rows point at the exact order without
-- risking audit survival on row deletion (003 philosophy).

alter table public.admin_audit_log
  add column if not exists order_id uuid;

create index if not exists idx_admin_audit_order on public.admin_audit_log (order_id)
  where order_id is not null;

-- ============================================================
-- STEP 3: update_seller_fulfillment() — the ONLY status path
-- ============================================================
-- Narrowly scoped SECURITY DEFINER RPC. The caller proves nothing
-- except a valid session: seller identity, verification, item
-- ownership, transition legality, and parent aggregation are all
-- derived/checked server-side. The statement updates ONLY
-- fulfillment_status (updated_at flows from the STEP 1 trigger);
-- product, seller, shop, price, quantity, customer, payment, and
-- financial columns are unwritable through this path by
-- construction (no such assignments exist below).

create or replace function public.update_seller_fulfillment(p_item_id uuid, p_status text)
returns text language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
  v_role text;
  v_verification text;
  v_item public.order_items%rowtype;
  v_old text;
  v_parent_status text;
  v_total integer;
  v_cancelled integer;
  v_delivered integer;
  v_shipped integer;
  v_processing integer;
  v_confirmed integer;
begin
  -- (1) Authenticated caller only.
  if v_caller is null then
    raise exception 'fulfillment: authentication required';
  end if;

  -- (2) Caller must be a verified seller (server-read profile).
  select role, verification_status into v_role, v_verification
  from public.profiles
  where id = v_caller;
  if not found then
    raise exception 'fulfillment: seller profile not found';
  end if;
  if v_role <> 'seller' or v_verification <> 'verified' then
    raise exception 'fulfillment: verified seller access required';
  end if;

  -- (3) Requested stage must exist.
  if p_status not in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'fulfillment: invalid status';
  end if;

  -- (4) Lock the item, then prove caller ownership from the row.
  select * into v_item
  from public.order_items
  where id = p_item_id
  for update;
  if not found then
    raise exception 'fulfillment: order item not found';
  end if;
  if v_item.seller_id is distinct from v_caller then
    raise exception 'fulfillment: order item not found';
  end if;
  v_old := v_item.fulfillment_status;

  -- (5) Exact transition table. Terminal stages have no outgoing
  -- branch, so delivered/cancelled (and every backwards or
  -- skipping jump) fall through to the raise. In particular
  -- shipped -> cancelled, delivered -> *, and cancelled -> *
  -- are all rejected here.
  if not (
    (v_old = 'pending' and p_status in ('confirmed', 'cancelled'))
    or (v_old = 'confirmed' and p_status in ('processing', 'cancelled'))
    or (v_old = 'processing' and p_status in ('shipped', 'cancelled'))
    or (v_old = 'shipped' and p_status = 'delivered')
  ) then
    raise exception 'fulfillment: illegal status transition';
  end if;

  -- (6) Write the stage. Nothing else on the row is assigned.
  update public.order_items
  set fulfillment_status = p_status
  where id = p_item_id;

  -- (7) Lock the parent BEFORE reading sibling stages, so a
  -- concurrent seller updating another item of the same order
  -- serializes here: the aggregate below always sees committed
  -- (never stale) item states. Atomic with (6) + (9) in this tx.
  perform 1 from public.orders where id = v_item.order_id for update;
  if not found then
    raise exception 'fulfillment: parent order not found';
  end if;

  -- (8) Deterministic parent aggregation over the ACTUAL items.
  -- Cancelled rows are excluded from progress stages (B-E) but
  -- force 'cancelled' only when unanimous (A). A mixed
  -- cancelled/delivered/shipped order therefore resolves to the
  -- highest active stage, never to delivered-by-partial-progress.
  select count(*),
         count(*) filter (where fulfillment_status = 'cancelled'),
         count(*) filter (where fulfillment_status = 'delivered'),
         count(*) filter (where fulfillment_status = 'shipped'),
         count(*) filter (where fulfillment_status = 'processing'),
         count(*) filter (where fulfillment_status = 'confirmed')
    into v_total, v_cancelled, v_delivered, v_shipped, v_processing, v_confirmed
  from public.order_items
  where order_id = v_item.order_id;

  if v_total = v_cancelled then
    v_parent_status := 'cancelled';
  elsif (v_total - v_cancelled) = v_delivered then
    v_parent_status := 'delivered';
  elsif v_shipped > 0 then
    -- Any non-cancelled shipped row dominates: rows counted in
    -- v_shipped are by construction non-cancelled members of
    -- this order (the filter counts only 'shipped' rows).
    v_parent_status := 'shipped';
  elsif v_processing > 0 then
    v_parent_status := 'processing';
  elsif v_confirmed > 0 then
    v_parent_status := 'confirmed';
  else
    v_parent_status := 'pending';
  end if;

  update public.orders
  set order_status = v_parent_status
  where id = v_item.order_id;

  -- (9) Audit: actor + order/item/product/shop refs only. No
  -- customer PII, no secrets, no frontend-supplied identity.
  -- target stays NULL (customer linkage would expose PII into a
  -- table normal admins cannot read but super admins can — the
  -- order_id link is sufficient for traceability).
  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id)
  values
    ('order.item_status_changed', v_caller, null, null,
     v_item.product_id, v_item.shop_id, v_item.order_id);

  return p_status;
end;
$$;

revoke all on function public.update_seller_fulfillment(uuid, text) from public, anon, service_role;
grant execute on function public.update_seller_fulfillment(uuid, text) to authenticated;

-- ============================================================
-- STEP 4: get_seller_orders() — own items, NO customer PII
-- ============================================================
-- Read-only DEFINER RPC (verified sellers only). Each row is one
-- OWN item plus non-sensitive parent identifiers (reference,
-- dates, shared parent stage). Customer contact/address fields
-- are DELIBERATELY ABSENT here: the list/queue view needs no PII.
-- Full delivery details live only in the per-order detail RPC
-- (STEP 5), which redacts terminal items server-side.

create or replace function public.get_seller_orders()
returns table (
  order_id uuid,
  order_number text,
  order_created_at timestamp with time zone,
  parent_order_status text,
  item_id uuid,
  product_name text,
  sku text,
  variant_name text,
  variant_attributes jsonb,
  quantity integer,
  unit_price numeric,
  line_subtotal numeric,
  fulfillment_status text,
  item_created_at timestamp with time zone
)
language sql stable security definer set search_path = public as
$$
  select o.id, o.order_number, o.created_at, o.order_status,
         i.id, i.product_name, i.sku, i.variant_name, i.variant_attributes,
         i.quantity, i.unit_price, i.line_subtotal,
         i.fulfillment_status, i.created_at
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.profiles p on p.id = auth.uid()
  where i.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
  order by o.created_at desc, i.created_at asc;
$$;

revoke all on function public.get_seller_orders() from public, anon, service_role;
grant execute on function public.get_seller_orders() to authenticated;

-- ============================================================
-- STEP 5: get_seller_order_detail(p_order_id) — one order slice
-- ============================================================
-- Same shape and guarantees as STEP 4, restricted to a single
-- order, PLUS the delivery contact/address subset needed to
-- fulfill it. Privacy rule (enforced HERE, server-side, per
-- ITEM, never in the frontend): terminal items (delivered,
-- cancelled) need no further fulfillment contact, so their PII
-- columns return NULL via CASE; active stages (pending,
-- confirmed, processing, shipped) return the values. Ownership is
-- proven by the join itself: callers with no item in the order
-- receive zero rows (indistinguishable from a nonexistent order
-- — no ownership oracle). The URL/order_id is never trusted as
-- authorization. No email (table carries none), no payment data,
-- no admin identity, no audit content, no other seller's rows.

create or replace function public.get_seller_order_detail(p_order_id uuid)
returns table (
  order_id uuid,
  order_number text,
  order_created_at timestamp with time zone,
  parent_order_status text,
  item_id uuid,
  product_name text,
  sku text,
  variant_name text,
  variant_attributes jsonb,
  quantity integer,
  unit_price numeric,
  line_subtotal numeric,
  fulfillment_status text,
  item_created_at timestamp with time zone,
  customer_name text,
  customer_mobile text,
  delivery_address text,
  delivery_division text,
  delivery_district text,
  delivery_upazila text,
  delivery_postal_code text
)
language sql stable security definer set search_path = public as
$$
  select o.id, o.order_number, o.created_at, o.order_status,
         i.id, i.product_name, i.sku, i.variant_name, i.variant_attributes,
         i.quantity, i.unit_price, i.line_subtotal,
         i.fulfillment_status, i.created_at,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.customer_name end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.mobile end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.address end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.division end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.district end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.upazila end,
         case when i.fulfillment_status in ('delivered', 'cancelled')
              then null else o.postal_code end
  from public.order_items i
  join public.orders o on o.id = i.order_id
  join public.profiles p on p.id = auth.uid()
  where i.seller_id = auth.uid()
    and i.order_id = p_order_id
    and p.role = 'seller'
    and p.verification_status = 'verified'
  order by i.created_at asc;
$$;

revoke all on function public.get_seller_order_detail(uuid) from public, anon, service_role;
grant execute on function public.get_seller_order_detail(uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - order_items gains fulfillment_status (NOT NULL, 6-value
--   CHECK, default pending → safe backfill) + updated_at trigger.
-- - update_seller_fulfillment(): auth + verified-seller +
--   FOR UPDATE item lock + ownership + exact transition table +
--   parent lock + deterministic aggregate + linked audit, one tx.
-- - Read RPCs return own-items-only slices with minimal
--   fulfillment PII; no parent-table policies, no UPDATE
--   policies, no new grants beyond EXECUTE-to-authenticated.
-- - 001-012 objects untouched except ADDITIVE changes: two
--   columns, one trigger, one audit column, one index. All three
--   RPCs are new names (no existing function replaced).
-- -----------------------------------------------------
