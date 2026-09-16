-- -----------------------------------------------------
-- Phase 12: secure marketplace order foundation (v1, no payments)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Checkout, cart, coupons, and tracking today are demo/localStorage
-- only (services/index.ts). The database has NO order objects at
-- all (verified: no order/payment/coupon tables in 001-011). This
-- migration adds the minimum secure foundation for REAL,
-- authenticated marketplace orders WITHOUT touching the demo flow:
--
-- - orders + order_items tables (snapshots, constrained statuses)
-- - ONE atomic creation RPC: create_order()
-- - Least-privilege RLS (customer-own / seller-own-items /
--   admin-read) + grants. No client INSERT/UPDATE/DELETE anywhere.
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No payment gateway, verification, refunds flow, payouts,
--   commissions, withdrawals, or earnings (future phases).
-- - No coupon tables or coupon logic. The demo coupon system stays
--   demo-only; the RPC takes NO coupon/discount input and records
--   discount = 0. Coupons are therefore UNAVAILABLE for real
--   orders until a proper DB coupon system lands (documented,
--   not silently trusted).
-- - No guest order creation or guest tracking (auth required;
--   guest tracking stays demo-only).
-- - No fulfillment/admin status RPCs yet (a later migration adds
--   them; admins get read-only visibility here).
-- - No order audit rows yet: admin_audit_log has no order
--   reference column. A future migration may add
--   admin_audit_log.order_id plus fulfillment audit writes.
-- - No demo migration: demo orders/products/cart stay untouched.
-- - No change to 001-011 objects (policies, triggers, RPCs,
--   grants on existing tables are byte-for-byte preserved).
-- - No DELETE policies anywhere. No service_role frontend use.
--
-- STOCK RULE (006 model, made explicit here because checkout
-- depends on it):
-- - products.stock_quantity is authoritative ONLY for SIMPLE
--   products (zero variants).
-- - When a product HAS variants, the item MUST reference a
--   variant, and product_variants.stock_quantity is authoritative.
--   Variant-less items for variant products are REJECTED (fail
--   closed) rather than guessing which balance to decrement.
-- - Effective unit price = COALESCE(discount_price, price):
--   discount_price (CHECK <= price) is the merchant's selling
--   price when set; otherwise the base price. For variant items
--   the variant price_override replaces the product price when
--   set (same COALESCE rule).
--
-- MONEY RULE: all money is numeric(12,2). No float types anywhere.
--
-- DELIVERY RULE (mirrors src/data/storeConfig.ts):
-- inside-dhaka 80 / outside-dhaka 130, free at subtotal >= 5000.
-- Duplicated here deliberately: the RPC must not trust client
-- totals. A future admin-settings table can own these constants;
-- until then this comment is the single source of the coupling.
--
-- Apply AFTER 001-011, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: orders table (one row per customer checkout)
-- ============================================================
-- customer_id is set ONLY from auth.uid() inside create_order()
-- (never accepted from the client). Address + totals are
-- snapshots: later profile/product edits never rewrite history.
-- payment starts 'pending' for every method (cod/bkash/nagad);
-- gateway verification is a future phase and NOT implied here.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Human-facing tracker. 12 hex chars from 128-bit entropy
  -- (unguessable in practice) + unique backstop. NEVER the sole
  -- authorization boundary: reads stay RLS-gated regardless.
  order_number text not null unique
    default ('NS-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 12))),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  mobile text not null check (mobile ~ '^01[3-9][0-9]{8}$'),
  alternative_mobile text check (alternative_mobile is null or alternative_mobile ~ '^01[3-9][0-9]{8}$'),
  address text not null check (char_length(address) between 5 and 1000),
  division text not null check (char_length(division) between 1 and 100),
  district text not null check (char_length(district) between 1 and 100),
  upazila text not null check (char_length(upazila) between 1 and 100),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  order_notes text check (order_notes is null or char_length(order_notes) <= 2000),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  delivery_charge numeric(12, 2) not null check (delivery_charge >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  delivery_zone text not null check (delivery_zone in ('inside-dhaka', 'outside-dhaka')),
  payment_method text not null check (payment_method in ('cod', 'bkash', 'nagad')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  order_status text not null default 'pending'
    check (order_status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (total = subtotal + delivery_charge - discount),
  check (discount <= subtotal + delivery_charge)
);

create index if not exists idx_orders_customer on public.orders (customer_id);
create index if not exists idx_orders_created on public.orders (created_at desc);
create index if not exists idx_orders_number on public.orders (order_number);
create index if not exists idx_orders_status on public.orders (order_status);

drop trigger if exists handle_orders_updated_at on public.orders;

create trigger handle_orders_updated_at
  before update on public.orders for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 2: order_items (immutable per-seller snapshots)
-- ============================================================
-- One row per purchased product/variant. seller_id/shop_id are
-- resolved from the authoritative product row inside the RPC
-- (never client input). Price/name/SKU/variant are frozen at
-- purchase time. RESTRICT everywhere: history must survive shop,
-- product, and variant administration. No client UPDATE/DELETE.

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  shop_id uuid references public.seller_shops (id) on delete restrict,
  product_name text not null check (char_length(product_name) between 1 and 200),
  sku text check (sku is null or char_length(sku) between 1 and 100),
  variant_name text,
  variant_attributes jsonb check (variant_attributes is null or jsonb_typeof(variant_attributes) = 'object'),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_subtotal numeric(12, 2) not null check (line_subtotal >= 0),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (line_subtotal = unit_price * quantity)
);

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_seller on public.order_items (seller_id);
create index if not exists idx_order_items_product on public.order_items (product_id);

-- ============================================================
-- STEP 3: RLS (default deny; least privilege per role)
-- ============================================================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- ---- customers: own orders + own items only. No writes. ----

drop policy if exists "Customers can view own orders" on public.orders;

create policy "Customers can view own orders"
  on public.orders for select
  using (customer_id = auth.uid());

drop policy if exists "Customers can view own order items" on public.order_items;

create policy "Customers can view own order items"
  on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.customer_id = auth.uid()
  ));

-- NOTE: intentionally NO insert/update/delete policies on either
-- table for any client role. Creation happens ONLY inside the
-- SECURITY DEFINER create_order() RPC below.

-- ---- sellers: own items only (fulfillment view). ----
-- Item rows carry NO customer PII (name/address live only on the
-- parent orders row, which sellers cannot read) — privacy by
-- construction, not by column filtering.

drop policy if exists "Sellers can view own order items" on public.order_items;

create policy "Sellers can view own order items"
  on public.order_items for select
  using (seller_id = auth.uid());

-- NOTE: sellers get NO access to the parent orders row (not even
-- their slice of it). A future fulfillment RPC can expose exactly
-- the fields packing requires; until then sellers join via
-- order_id references they already hold.

-- ---- admins: read-only visibility (existing model). ----
-- No admin write policies: fulfillment/status transitions arrive
-- with a later migration's RPCs, never direct UPDATEs.

drop policy if exists "Admins can view all orders" on public.orders;

create policy "Admins can view all orders"
  on public.orders for select
  using (public.is_admin());

drop policy if exists "Admins can view all order items" on public.order_items;

create policy "Admins can view all order items"
  on public.order_items for select
  using (public.is_admin());

-- ============================================================
-- STEP 4: least-privilege GRANTs (new objects only)
-- ============================================================
-- Grants decide reachability; policies decide visibility. Deny
-- first, then the minimum. 001-011 grants untouched.

revoke all on public.orders from public, anon;
revoke all on public.order_items from public, anon;

-- Reads flow through the policies above; writes are RPC-only, so
-- no INSERT/UPDATE/DELETE grants exist for any client role.
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

-- ============================================================
-- STEP 5: create_order() — the ONLY creation path
-- ============================================================
-- Single-transaction, fail-closed. Every money/ownership/status
-- value is derived server-side; the client supplies ONLY:
-- item references + quantities, address text, delivery zone, and
-- payment method. Anything else client-sent is ignored (there is
-- nowhere to put it: no totals/price/seller/status parameters
-- exist in this signature by design).

create or replace function public.create_order(
  p_items jsonb,
  p_customer_name text,
  p_mobile text,
  p_alternative_mobile text,
  p_address text,
  p_division text,
  p_district text,
  p_upazila text,
  p_postal_code text,
  p_order_notes text,
  p_delivery_zone text,
  p_payment_method text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_customer_id uuid := auth.uid();
  v_len integer;
  v_i integer;
  v_elem jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_prod public.products%rowtype;
  v_var public.product_variants%rowtype;
  v_has_variants boolean;
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_delivery numeric(12, 2);
  v_total numeric(12, 2);
  v_order_id uuid;
begin
  -- (1) Authenticated customer only. service_role/API keys without
  -- a user JWT have NULL auth.uid() and are rejected here too.
  if v_customer_id is null then
    raise exception 'order: authentication required';
  end if;
  perform 1 from public.profiles where id = v_customer_id;
  if not found then
    raise exception 'order: customer profile not found';
  end if;

  -- (2) Address + method validation (lengths mirror table CHECKs;
  -- failing fast with clean errors instead of constraint noise).
  if p_customer_name is null or char_length(p_customer_name) < 2 or char_length(p_customer_name) > 120 then
    raise exception 'order: customer name must be 2-120 characters';
  end if;
  if p_mobile is null or p_mobile !~ '^01[3-9][0-9]{8}$' then
    raise exception 'order: invalid mobile number';
  end if;
  if p_alternative_mobile is not null and p_alternative_mobile <> ''
     and p_alternative_mobile !~ '^01[3-9][0-9]{8}$' then
    raise exception 'order: invalid alternative mobile number';
  end if;
  if p_address is null or char_length(p_address) < 5 or char_length(p_address) > 1000 then
    raise exception 'order: address must be 5-1000 characters';
  end if;
  if p_division is null or char_length(p_division) < 1 or char_length(p_division) > 100
     or p_district is null or char_length(p_district) < 1 or char_length(p_district) > 100
     or p_upazila is null or char_length(p_upazila) < 1 or char_length(p_upazila) > 100 then
    raise exception 'order: division, district and upazila are required';
  end if;
  if p_delivery_zone not in ('inside-dhaka', 'outside-dhaka') then
    raise exception 'order: invalid delivery zone';
  end if;
  if p_payment_method not in ('cod', 'bkash', 'nagad') then
    raise exception 'order: invalid payment method';
  end if;

  -- (3) Items shape: array of 1-50 objects. No totals, prices,
  -- sellers, or statuses are accepted (no such fields are read).
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'order: items must be a list';
  end if;
  v_len := jsonb_array_length(p_items);
  if v_len < 1 or v_len > 50 then
    raise exception 'order: between 1 and 50 items required';
  end if;

  -- (4) Staging table for validated lines (keeps INSERTs clean).
  create temporary table if not exists tmp_order_lines (
    product_id uuid,
    variant_id uuid,
    seller_id uuid,
    shop_id uuid,
    product_name text,
    sku text,
    variant_name text,
    variant_attributes jsonb,
    unit_price numeric(12, 2),
    quantity integer
  ) on commit drop;

  for v_i in 0 .. v_len - 1 loop
    v_elem := p_items -> v_i;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'order: invalid item at position %', v_i;
    end if;

    begin
      v_product_id := nullif(v_elem ->> 'product_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'order: invalid product at position %', v_i;
    end;
    if v_product_id is null then
      raise exception 'order: invalid product at position %', v_i;
    end if;

    if nullif(v_elem ->> 'variant_id', '') is null then
      v_variant_id := null;
    else
      begin
        v_variant_id := (v_elem ->> 'variant_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'order: invalid variant at position %', v_i;
      end;
    end if;

    begin
      v_quantity := (v_elem ->> 'quantity')::integer;
    exception when invalid_text_representation then
      raise exception 'order: invalid quantity at position %', v_i;
    end;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'order: quantity must be 1-99 at position %', v_i;
    end if;

    -- (5) Lock + resolve the authoritative product row. Only
    -- publicly orderable products pass: approved + active +
    -- not hidden + active category (+ active shop unless the
    -- product is shopless/admin-owned, mirroring 009 visibility).
    select * into v_prod
    from public.products
    where id = v_product_id
    for update;
    if not found then
      raise exception 'order: product not available at position %', v_i;
    end if;
    if v_prod.status <> 'approved' or not v_prod.is_active or v_prod.hidden_by_admin then
      raise exception 'order: product not available at position %', v_i;
    end if;
    perform 1 from public.categories where id = v_prod.category_id and is_active;
    if not found then
      raise exception 'order: product not available at position %', v_i;
    end if;
    if v_prod.shop_id is not null then
      perform 1 from public.seller_shops where id = v_prod.shop_id and status = 'active';
      if not found then
        raise exception 'order: product not available at position %', v_i;
      end if;
    end if;

    -- (6) Variant rule (006 model): variant products REQUIRE a
    -- variant reference; simple products use product stock/price.
    select exists (
      select 1 from public.product_variants where product_id = v_product_id
    ) into v_has_variants;

    if v_has_variants and v_variant_id is null then
      raise exception 'order: variant selection required at position %', v_i;
    end if;

    if v_variant_id is not null then
      select * into v_var
      from public.product_variants
      where id = v_variant_id
      for update;
      if not found or v_var.product_id is distinct from v_product_id or not v_var.is_active then
        raise exception 'order: invalid variant at position %', v_i;
      end if;
      if v_var.stock_quantity < v_quantity then
        raise exception 'order: insufficient stock at position %', v_i;
      end if;
      -- Variant price replaces product price when set (same
      -- COALESCE rule as product discount pricing).
      if v_var.price_override is not null then
        v_unit_price := v_var.price_override;
      elsif v_prod.discount_price is not null then
        v_unit_price := v_prod.discount_price;
      else
        v_unit_price := v_prod.price;
      end if;
      update public.product_variants
      set stock_quantity = stock_quantity - v_quantity
      where id = v_variant_id;
      insert into tmp_order_lines
      values (v_product_id, v_variant_id, v_prod.seller_id, v_prod.shop_id,
              v_prod.name, v_prod.sku, v_var.name, v_var.attributes,
              v_unit_price, v_quantity);
    else
      if v_prod.stock_quantity < v_quantity then
        raise exception 'order: insufficient stock at position %', v_i;
      end if;
      if v_prod.discount_price is not null then
        v_unit_price := v_prod.discount_price;
      else
        v_unit_price := v_prod.price;
      end if;
      update public.products
      set stock_quantity = stock_quantity - v_quantity
      where id = v_product_id;
      insert into tmp_order_lines
      values (v_product_id, null, v_prod.seller_id, v_prod.shop_id,
              v_prod.name, v_prod.sku, null, null,
              v_unit_price, v_quantity);
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_quantity;
  end loop;

  -- (7) Server-side totals. Delivery mirrors the storefront rule
  -- (80/130, free at 5000+). Discount is 0: no coupon system
  -- exists for real orders yet (documented, never client-fed).
  if v_subtotal >= 5000 then
    v_delivery := 0;
  elsif p_delivery_zone = 'inside-dhaka' then
    v_delivery := 80;
  else
    v_delivery := 130;
  end if;
  v_total := v_subtotal + v_delivery;

  -- (8) Persist header + snapshot lines atomically. Statuses take
  -- safe defaults (pending/pending); no transition RPCs exist yet
  -- by design. Returns the order id only.
  insert into public.orders (
    customer_id, customer_name, mobile, alternative_mobile,
    address, division, district, upazila, postal_code, order_notes,
    subtotal, delivery_charge, discount, total,
    delivery_zone, payment_method
  )
  values (
    v_customer_id, p_customer_name, p_mobile,
    nullif(p_alternative_mobile, ''),
    p_address, p_division, p_district, p_upazila,
    nullif(p_postal_code, ''), nullif(p_order_notes, ''),
    v_subtotal, v_delivery, 0, v_total,
    p_delivery_zone, p_payment_method
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, variant_id, seller_id, shop_id,
    product_name, sku, variant_name, variant_attributes,
    unit_price, quantity, line_subtotal
  )
  select v_order_id, product_id, variant_id, seller_id, shop_id,
         product_name, sku, variant_name, variant_attributes,
         unit_price, quantity, unit_price * quantity
  from tmp_order_lines;

  return v_order_id;
end;
$$;

revoke all on function public.create_order(jsonb, text, text, text, text, text, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function public.create_order(jsonb, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - orders/order_items: snapshots + constrained statuses, RLS
--   default-deny (customer-own / seller-own-items / admin-read),
--   no client writes, RESTRICT history, numeric money.
-- - create_order(): auth-derived customer, locked authoritative
--   rows, visibility + variant + stock gates, server prices and
--   totals, atomic persist, id-only return.
-- - Explicitly deferred: coupons, payments/verification,
--   fulfillment + admin status RPCs, guest flows, order audit
--   linkage. Demo checkout untouched.
-- -----------------------------------------------------
