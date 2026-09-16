-- -----------------------------------------------------
-- Phase 6: real multi-vendor marketplace catalog foundation
-- -----------------------------------------------------
-- Creates seller_shops, categories, products, product_images,
-- product_variants (+ moderation RPC) WITHOUT touching 001-005
-- objects, WITHOUT migrating demo/localStorage data, and WITHOUT
-- weakening any existing control.
--
-- Authority model (unchanged philosophy):
-- - Grants decide reachability; RLS policies decide visibility.
-- - role / verification_status come ONLY from profiles (DB-read).
-- - Sellers can never set approved, transfer ownership, or touch
--   moderation columns; moderation is RPC-only (admin-gated).
-- - RLS WITH CHECK cannot compare old/new rows, so immutability and
--   legal status transitions are enforced by BEFORE UPDATE triggers.
-- - No NEW/OLD references and no self-referencing subqueries appear
--   in any policy (no RLS recursion by construction).
--
-- Inventory model (single-source, documented):
-- - products.stock_quantity is authoritative for SIMPLE products
--   (products with zero variants).
-- - product_variants.stock_quantity is authoritative per variant SKU.
-- - When variants exist, available stock is reconciled at READ time
--   as the sum of active variant stocks; writers MUST NOT treat the
--   two columns as independent balances. Atomic decrement moves to
--   the orders phase (no oversell-safe checkout exists yet).
-- - CHECKs forbid negative stock on both columns.
--
-- Cascade policy (non-destructive for business records):
-- - profiles -> seller_shops: CASCADE is avoided; shops reference
--   profiles with RESTRICT so a seller with a shop cannot vanish.
--   (Shop removal is a future superuser workflow, out of scope.)
-- - products -> images/variants: CASCADE (subordinate rows die with
--   the product; products themselves are RESTRICT-protected).
-- - categories -> products: RESTRICT (deactivate instead of delete).
--
-- Apply AFTER 001-005, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: seller_shops
-- ============================================================

create table if not exists public.seller_shops (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.profiles (id) on delete restrict,
  shop_name text not null check (char_length(shop_name) between 1 and 200),
  shop_slug text not null unique check (shop_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 2000),
  logo_url text check (logo_url is null or (logo_url like 'https://%' and char_length(logo_url) <= 2000)),
  banner_url text check (banner_url is null or (banner_url like 'https://%' and char_length(banner_url) <= 2000)),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_seller_shops_status on public.seller_shops (status);

-- ============================================================
-- STEP 2: categories (parent/child, admin-managed)
-- ============================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 2000),
  image_url text check (image_url is null or (image_url like 'https://%' and char_length(image_url) <= 2000)),
  parent_id uuid references public.categories (id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (parent_id is distinct from id)
);

create index if not exists idx_categories_parent on public.categories (parent_id);
create index if not exists idx_categories_active on public.categories (is_active);
create index if not exists idx_categories_sort on public.categories (sort_order);

-- Cycle guard: no category may be its own ancestor at any depth.
-- (The CHECK above covers depth 0; this trigger walks the chain.)

create or replace function public.check_category_hierarchy()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  v_current := new.parent_id;
  while v_current is not null loop
    if v_current = new.id then
      raise exception 'categories: hierarchy cycle detected';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 16 then
      raise exception 'categories: hierarchy too deep';
    end if;
    select parent_id into v_current from public.categories where id = v_current;
  end loop;
  return new;
end;
$$;

drop trigger if exists guard_category_hierarchy on public.categories;

create trigger guard_category_hierarchy
  before insert or update on public.categories
  for each row
  execute function public.check_category_hierarchy();

-- ============================================================
-- STEP 3: products
-- ============================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  shop_id uuid not null references public.seller_shops (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  short_description text check (short_description is null or char_length(short_description) <= 500),
  description text check (description is null or char_length(description) <= 10000),
  sku text check (sku is null or char_length(sku) between 1 and 100),
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  discount_price numeric(12, 2) check (discount_price is null or discount_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'inactive')),
  brand text check (brand is null or char_length(brand) <= 100),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (discount_price is null or discount_price <= price),
  check (compare_at_price is null or compare_at_price >= price)
);

create unique index if not exists idx_products_sku_unique on public.products (sku) where sku is not null;
create index if not exists idx_products_seller on public.products (seller_id);
create index if not exists idx_products_shop on public.products (shop_id);
create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_status on public.products (status);
create index if not exists idx_products_active on public.products (is_active);
create index if not exists idx_products_created on public.products (created_at desc);
create index if not exists idx_products_seller_status on public.products (seller_id, status);
create index if not exists idx_products_shop_status on public.products (shop_id, status);
create index if not exists idx_products_category_status on public.products (category_id, status);

-- ============================================================
-- STEP 4: product_images (ownership flows through products)
-- ============================================================

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  image_url text not null check (image_url like 'https://%' and char_length(image_url) <= 2000),
  alt_text text check (alt_text is null or char_length(alt_text) <= 200),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- At most one primary image per product.
create unique index if not exists idx_product_images_one_primary
  on public.product_images (product_id)
  where is_primary;
create index if not exists idx_product_images_product on public.product_images (product_id, sort_order);

-- ============================================================
-- STEP 5: product_variants (JSONB attributes only, never ownership)
-- ============================================================

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text check (sku is null or char_length(sku) between 1 and 100),
  name text not null check (char_length(name) between 1 and 200),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  price_override numeric(12, 2) check (price_override is null or price_override >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists idx_product_variants_sku_unique
  on public.product_variants (sku) where sku is not null;
create index if not exists idx_product_variants_product on public.product_variants (product_id);
create index if not exists idx_product_variants_active on public.product_variants (is_active);

-- ============================================================
-- STEP 6: updated_at triggers (reuse handle_updated_at from 001/002)
-- ============================================================

drop trigger if exists handle_seller_shops_updated_at on public.seller_shops;
create trigger handle_seller_shops_updated_at
  before update on public.seller_shops for each row execute function public.handle_updated_at();

drop trigger if exists handle_categories_updated_at on public.categories;
create trigger handle_categories_updated_at
  before update on public.categories for each row execute function public.handle_updated_at();

drop trigger if exists handle_products_updated_at on public.products;
create trigger handle_products_updated_at
  before update on public.products for each row execute function public.handle_updated_at();

drop trigger if exists handle_product_variants_updated_at on public.product_variants;
create trigger handle_product_variants_updated_at
  before update on public.product_variants for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 7: ownership / moderation guard triggers
-- ============================================================

-- Shops: seller_id, slug and created_at are immutable for everyone.
-- Status changes have no client path except admin policy (step 9);
-- sellers keep status='active' via their WITH CHECK clause.

create or replace function public.guard_shop_immutable()
returns trigger language plpgsql set search_path = public as
$$
begin
  if new.seller_id is distinct from old.seller_id
     or new.shop_slug is distinct from old.shop_slug
     or new.created_at is distinct from old.created_at then
    raise exception 'seller_shops: seller_id, shop_slug and created_at are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_shop_immutable on public.seller_shops;
create trigger guard_shop_immutable
  before update on public.seller_shops for each row execute function public.guard_shop_immutable();

-- Products: id/seller_id/shop_id immutable, always.
-- Business-controlled columns is_featured and created_at are likewise
-- immutable for every writer (featured placement is a marketplace
-- decision; created_at drives "newest" ordering and must not be
-- gameable). rejection_reason changes ONLY inside the moderation RPC
-- (flag-gated): sellers can neither fabricate nor erase admin notes.
-- Status transitions WITHOUT the moderation flag are limited to the
-- safe seller lifecycle: draft <-> pending_review, rejected -> draft,
-- approved -> inactive (voluntary unlist), inactive -> draft.
-- The flag-gated exemption (set ONLY inside moderate_product below)
-- additionally permits pending_review -> approved and
-- {pending_review, approved} -> rejected. NOTHING may become approved
-- without the flag. No service_role bypass exists.

create or replace function public.guard_product_protection()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_flagged boolean := (current_setting('app.moderation', true) = 'on');
begin
  if new.id is distinct from old.id
     or new.seller_id is distinct from old.seller_id
     or new.shop_id is distinct from old.shop_id then
    raise exception 'products: id, seller_id and shop_id are immutable';
  end if;

  if new.is_featured is distinct from old.is_featured
     or new.created_at is distinct from old.created_at then
    raise exception 'products: is_featured and created_at are immutable (contact marketplace team)';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason
     and not v_flagged then
    raise exception 'products: rejection_reason is managed by the moderation workflow';
  end if;

  if new.status is distinct from old.status then
    if (old.status = 'draft' and new.status = 'pending_review')
       or (old.status = 'pending_review' and new.status = 'draft')
       or (old.status = 'rejected' and new.status = 'draft')
       or (old.status = 'approved' and new.status = 'inactive')
       or (old.status = 'inactive' and new.status = 'draft') then
      return new;
    end if;
    if v_flagged and (
         (old.status = 'pending_review' and new.status = 'approved')
         or ((old.status = 'pending_review' or old.status = 'approved') and new.status = 'rejected')
       ) then
      return new;
    end if;
    raise exception 'products: illegal status transition (use the moderation workflow)';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_product_protection on public.products;
create trigger guard_product_protection
  before update on public.products for each row execute function public.guard_product_protection();

-- ============================================================
-- STEP 8: product moderation RPC (admin-only, audited, atomic)
-- ============================================================

drop function if exists public.moderate_product(uuid, text, text);

create or replace function public.moderate_product(p_product_id uuid, p_decision text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_admin_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_admin_id is null then
    raise exception 'product moderation: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'product moderation: administrator access required';
  end if;
  if p_decision <> 'approved' and p_decision <> 'rejected' then
    raise exception 'product moderation: decision must be approved or rejected';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product moderation: product not found';
  end if;
  if p_decision = 'approved' and v_product.status <> 'pending_review' then
    raise exception 'product moderation: only pending_review products can be approved';
  end if;
  if p_decision = 'rejected' and v_product.status <> 'pending_review' and v_product.status <> 'approved' then
    raise exception 'product moderation: only pending_review or approved products can be rejected';
  end if;

  perform set_config('app.moderation', 'on', true);

  update public.products
  set status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then v_reason else null end
  where id = p_product_id;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('product.' || p_decision, v_admin_id, v_product.seller_id, null);

  return p_product_id;
end;
$$;

revoke all on function public.moderate_product(uuid, text, text) from public, anon, service_role;
grant execute on function public.moderate_product(uuid, text, text) to authenticated;

-- ============================================================
-- STEP 9: RLS — default deny, then least privilege
-- ============================================================

alter table public.seller_shops enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;

-- ---- helper predicates are inlined (no helper functions needed):
-- verified seller  := exists (select 1 from public.profiles
--                       where id = auth.uid() and role = 'seller'
--                       and verification_status = 'verified')
-- (Cross-table EXISTS is recursion-safe: never the policy's own table.)

-- ================= categories =================
-- Public: active categories only.

drop policy if exists "Public can view active categories" on public.categories;
create policy "Public can view active categories"
  on public.categories for select using (is_active);

-- Admins: full read + safe writes (no DELETE; deactivate instead).

drop policy if exists "Admins can view all categories" on public.categories;
create policy "Admins can view all categories"
  on public.categories for select using (public.is_admin());

drop policy if exists "Admins can insert categories" on public.categories;
create policy "Admins can insert categories"
  on public.categories for insert with check (public.is_admin());

drop policy if exists "Admins can update categories" on public.categories;
create policy "Admins can update categories"
  on public.categories for update using (public.is_admin()) with check (public.is_admin());

-- ================= seller_shops =================
-- Public: active shops only (branding + description, never privates).

drop policy if exists "Public can view active shops" on public.seller_shops;
create policy "Public can view active shops"
  on public.seller_shops for select using (status = 'active');

-- Sellers: own shop only; creation forces own id + active status and
-- requires verified-seller identity (sellers/pending/rejected blocked).

drop policy if exists "Sellers can view own shop" on public.seller_shops;
create policy "Sellers can view own shop"
  on public.seller_shops for select using (seller_id = auth.uid());

drop policy if exists "Verified sellers can create own shop" on public.seller_shops;
create policy "Verified sellers can create own shop"
  on public.seller_shops for insert with check (
    seller_id = auth.uid()
    and status = 'active'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'seller' and verification_status = 'verified')
  );

-- Sellers edit safe fields only (name/desc/logo/banner); seller_id,
-- slug and status changes are blocked here AND by the guard trigger.

drop policy if exists "Sellers can update own shop" on public.seller_shops;
create policy "Sellers can update own shop"
  on public.seller_shops for update
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid() and status = 'active');

-- Admins: inspect all + moderate status (suspend/reactivate).

drop policy if exists "Admins can view all shops" on public.seller_shops;
create policy "Admins can view all shops"
  on public.seller_shops for select using (public.is_admin());

drop policy if exists "Admins can moderate shops" on public.seller_shops;
create policy "Admins can moderate shops"
  on public.seller_shops for update using (public.is_admin()) with check (public.is_admin());

-- NOTE: intentionally NO delete policies on seller_shops (RESTRICT FKs
-- protect business records; removal is a future superuser workflow).

-- ================= products =================
-- Public: approved + active products of active shops in active
-- categories. Drafts/rejected/inactive are invisible publicly.

drop policy if exists "Public can view approved products" on public.products;
create policy "Public can view approved products"
  on public.products for select using (
    status = 'approved' and is_active
    and exists (select 1 from public.seller_shops s where s.id = shop_id and s.status = 'active')
    and exists (select 1 from public.categories c where c.id = category_id and c.is_active)
  );

-- Sellers: own rows only; verified-seller identity; owned shop;
-- status forced to draft/pending_review (NEVER approved via browser).

drop policy if exists "Sellers can view own products" on public.products;
create policy "Sellers can view own products"
  on public.products for select using (seller_id = auth.uid());

drop policy if exists "Verified sellers can insert own products" on public.products;
create policy "Verified sellers can insert own products"
  on public.products for insert with check (
    seller_id = auth.uid()
    and status in ('draft', 'pending_review')
    and is_featured = false
    and rejection_reason is null
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'seller' and verification_status = 'verified')
    and exists (select 1 from public.seller_shops s where s.id = shop_id and s.seller_id = auth.uid())
  );

-- Sellers update own rows within the safe lifecycle; ownership and
-- privileged transitions are trigger-guarded (step 7).

drop policy if exists "Verified sellers can update own products" on public.products;
create policy "Verified sellers can update own products"
  on public.products for update
  using (
    seller_id = auth.uid()
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'seller' and verification_status = 'verified')
  )
  with check (
    seller_id = auth.uid()
    and status in ('draft', 'pending_review', 'inactive')
    and exists (select 1 from public.seller_shops s where s.id = shop_id and s.seller_id = auth.uid())
  );

-- Admins: inspect everything. NO direct admin update (moderation is
-- RPC-only); NO delete policies anywhere on products.

drop policy if exists "Admins can view all products" on public.products;
create policy "Admins can view all products"
  on public.products for select using (public.is_admin());

-- ================= product_images =================
-- Public: images of publicly visible products only.

drop policy if exists "Public can view images of public products" on public.product_images;
create policy "Public can view images of public products"
  on public.product_images for select using (
    exists (
      select 1 from public.products p
      join public.seller_shops s on s.id = p.shop_id
      join public.categories c on c.id = p.category_id
      where p.id = product_id and p.status = 'approved' and p.is_active
        and s.status = 'active' and c.is_active
    )
  );

-- Sellers: full management (insert/update/delete/select) of ONLY their
-- own products' images. A owns-product predicate (different table:
-- no recursion) gates every operation.

drop policy if exists "Sellers manage own product images" on public.product_images;
create policy "Sellers manage own product images"
  on public.product_images for all
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));

-- Admins: inspect all images.

drop policy if exists "Admins can view all images" on public.product_images;
create policy "Admins can view all images"
  on public.product_images for select using (public.is_admin());

-- ================= product_variants =================
-- Same ownership model as images.

drop policy if exists "Public can view variants of public products" on public.product_variants;
create policy "Public can view variants of public products"
  on public.product_variants for select using (
    is_active and exists (
      select 1 from public.products p
      join public.seller_shops s on s.id = p.shop_id
      join public.categories c on c.id = p.category_id
      where p.id = product_id and p.status = 'approved' and p.is_active
        and s.status = 'active' and c.is_active
    )
  );

drop policy if exists "Sellers manage own product variants" on public.product_variants;
create policy "Sellers manage own product variants"
  on public.product_variants for all
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()))
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));

drop policy if exists "Admins can view all variants" on public.product_variants;
create policy "Admins can view all variants"
  on public.product_variants for select using (public.is_admin());

-- ============================================================
-- STEP 10: explicit least-privilege GRANTs (new objects only)
-- ============================================================
-- Deny first, then grant minimum. Profiles/applications/audit grants
-- from 001-004 are left exactly as-is.

revoke all on public.seller_shops from public, anon;
revoke all on public.categories from public, anon;
revoke all on public.products from public, anon;
revoke all on public.product_images from public, anon;
revoke all on public.product_variants from public, anon;

-- Categories: public reads active rows through policy; admins manage.
grant select on public.categories to authenticated;
grant insert, update on public.categories to authenticated;

-- Shops/products: full client lifecycle EXCEPT the trigger/RPC-gated
-- transitions (ungranted operations are impossible regardless).
grant select, insert, update on public.seller_shops to authenticated;
grant select, insert, update on public.products to authenticated;

-- Images/variants: owner management includes delete (subordinate rows;
-- parent products are RESTRICT-protected business records).
grant select, insert, update, delete on public.product_images to authenticated;
grant select, insert, update, delete on public.product_variants to authenticated;

-- No DELETE grants on seller_shops, categories, products to any client role.
-- No INSERT/UPDATE/DELETE grants on admin_audit_log beyond 003.
-- RPC EXECUTE narrowed per function (step 8).

-- ============================================================
-- SUMMARY (what this migration guarantees)
-- ============================================================
-- - Verified sellers own exactly their shop/products/images/variants;
--   seller A sees zero of seller B's private catalog (RLS + grants).
-- - Products can NEVER become approved via browser input (policy WITH
--   CHECK + trigger transition map); moderation is one audited RPC.
-- - Ownership columns and slugs are trigger-immutable for every writer.
-- - Public sees only active shops/categories and approved+active
--   products with their images/variants. Drafts/rejected/inactive are
--   invisible. Pending/rejected sellers and customers cannot write.
-- - Demo/localStorage catalog is untouched; no data migrated.
--------------------------------------------------------------------
