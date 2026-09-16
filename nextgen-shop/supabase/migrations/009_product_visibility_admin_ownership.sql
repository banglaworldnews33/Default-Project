-- -----------------------------------------------------
-- Phase 9: product visibility controls + admin ownership
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- The 001-008 model assumes every product belongs to a verified
-- seller with an active shop. Admins can curate and moderate but
-- cannot own products directly. This migration adds:
--
-- 1. owner_type column — distinguishes admin-owned from seller-owned
--    products without creating fake seller accounts.
-- 2. hidden_by_admin / hidden_at — allows admins to hide any
--    published product from public view without changing its
--    moderation status or ownership.
-- 3. hide_product() / restore_product() RPCs — audited, admin-only
--    functions that toggle visibility.
-- 4. Updated RLS policies — public queries exclude hidden products;
--    sellers cannot create admin-owned products; admin INSERT allows
--    shopless admin-owned products.
-- 5. Updated product guard trigger — owner_type is immutable;
--    hidden_by_admin / hidden_at are admin-only.
--
-- Safety guarantees:
-- - No existing policy, grant, function, trigger, or column is
--   broken. Seller/customer/anon behavior is identical for existing
--   rows.
-- - shop_id becomes NULLABLE so admin products don't require a
--   seller shop. Existing rows keep their shop_id.
-- - owner_type defaults to 'seller' — every existing row keeps
--   its ownership classification.
-- - hidden_by_admin defaults to false — every existing row keeps
--   its public visibility.
-- - RLS remains enabled on all tables.
-- - No DELETE policies are added anywhere.
-- - No service_role is exposed to the frontend.
-- - All RPCs require authentication + is_admin().
--
-- Apply AFTER 001-008, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: add new columns to products
-- ============================================================
-- owner_type: 'seller' (default) or 'admin'. Controls whether the
-- product belongs to a seller shop or directly to an admin profile.
-- hidden_by_admin: when true, the product is excluded from all
-- public views regardless of its status.
-- hidden_at: timestamp of when the product was hidden (nullable).

alter table public.products
  add column if not exists owner_type text not null default 'seller';

do $$ begin
  alter table public.products
    add constraint products_owner_type_check
    check (owner_type in ('seller', 'admin'));
exception when duplicate_object then null;
end $$;

alter table public.products
  add column if not exists hidden_by_admin boolean not null default false;

alter table public.products
  add column if not exists hidden_at timestamp with time zone;

-- ============================================================
-- STEP 2: make shop_id nullable for admin-owned products
-- ============================================================
-- Admin products don't belong to any seller shop. Existing rows
-- retain their shop_id (NOT NULL -> nullable is safe in Postgres).

alter table public.products
  alter column shop_id drop not null;

-- ============================================================
-- STEP 3: update product guard trigger
-- ============================================================
-- The 006 trigger enforces immutability of id/seller_id/shop_id,
-- is_featured, created_at, and status transitions. We extend it
-- to also enforce:
-- - owner_type immutability (prevents silent ownership transfer)
-- - hidden_by_admin / hidden_at admin-only access (defense in depth
--   alongside RLS; the trigger prevents non-admin UPDATE from
--   touching these columns even if a future policy is misconfigured)

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

  -- owner_type is immutable after creation (prevents ownership transfer)
  if new.owner_type is distinct from old.owner_type then
    raise exception 'products: owner_type is immutable (ownership cannot be transferred)';
  end if;

  if new.is_featured is distinct from old.is_featured
     or new.created_at is distinct from old.created_at then
    raise exception 'products: is_featured and created_at are immutable (contact marketplace team)';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason
     and not v_flagged then
    raise exception 'products: rejection_reason is managed by the moderation workflow';
  end if;

  -- hidden_by_admin and hidden_at may only be changed by admins
  if (new.hidden_by_admin is distinct from old.hidden_by_admin
      or new.hidden_at is distinct from old.hidden_at)
     and not public.is_admin() then
    raise exception 'products: hidden_by_admin and hidden_at are admin-only fields';
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

-- ============================================================
-- STEP 4: hide_product() RPC
-- ============================================================
-- Admin-only. Sets hidden_by_admin = true and hidden_at = now().
-- Inserts audit row. Does NOT modify status, ownership, or any
-- other product field.

create or replace function public.hide_product(p_product_id uuid)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_admin_id uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_admin_id is null then
    raise exception 'hide_product: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'hide_product: administrator access required';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'hide_product: product not found';
  end if;

  if v_product.hidden_by_admin then
    raise exception 'hide_product: product is already hidden';
  end if;

  update public.products
  set hidden_by_admin = true,
      hidden_at = timezone('utc'::text, now())
  where id = p_product_id;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('product.admin_hide', v_admin_id, v_product.seller_id, null);

  return p_product_id;
end;
$$;

revoke all on function public.hide_product(uuid) from public, anon, service_role;
grant execute on function public.hide_product(uuid) to authenticated;

-- ============================================================
-- STEP 5: restore_product() RPC
-- ============================================================
-- Admin-only. Sets hidden_by_admin = false and clears hidden_at.
-- Inserts audit row. Does NOT modify status, ownership, or any
-- other product field. Respects existing moderation rules — the
-- product's status is unchanged.

create or replace function public.restore_product(p_product_id uuid)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_admin_id uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_admin_id is null then
    raise exception 'restore_product: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'restore_product: administrator access required';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'restore_product: product not found';
  end if;

  if not v_product.hidden_by_admin then
    raise exception 'restore_product: product is not hidden';
  end if;

  update public.products
  set hidden_by_admin = false,
      hidden_at = null
  where id = p_product_id;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('product.admin_restore', v_admin_id, v_product.seller_id, null);

  return p_product_id;
end;
$$;

revoke all on function public.restore_product(uuid) from public, anon, service_role;
grant execute on function public.restore_product(uuid) to authenticated;

-- ============================================================
-- STEP 6: replace product INSERT policies
-- ============================================================
-- The existing seller INSERT policy (006) allows verified sellers
-- to insert products with their own seller_id and shop_id. We
-- strengthen it to also require owner_type = 'seller' (prevents
-- sellers from creating admin-owned products).
--
-- The existing admin INSERT policy (008) requires a verified
-- seller and a seller shop. We replace it to support TWO paths:
-- (a) admin-owned: seller_id = auth.uid(), shop_id IS NULL,
--     owner_type = 'admin'
-- (b) seller-owned: verified seller + their shop, owner_type = 'seller'

-- === seller INSERT: add owner_type = 'seller' guard ===

drop policy if exists "Verified sellers can insert own products" on public.products;

create policy "Verified sellers can insert own products"
  on public.products for insert with check (
    seller_id = auth.uid()
    and owner_type = 'seller'
    and status in ('draft', 'pending_review')
    and is_featured = false
    and rejection_reason is null
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'seller' and verification_status = 'verified')
    and exists (select 1 from public.seller_shops s where s.id = shop_id and s.seller_id = auth.uid())
  );

-- === admin INSERT: support admin-owned and seller-owned products ===

drop policy if exists "Admins can insert products" on public.products;

create policy "Admins can insert products"
  on public.products for insert with check (
    public.is_admin()
    and status in ('draft', 'pending_review', 'approved')
    and is_featured = false
    and rejection_reason is null
    and (
      -- path (a): admin-owned product — no shop required
      (owner_type = 'admin'
       and seller_id = auth.uid()
       and shop_id is null)
      or
      -- path (b): seller-owned product — verified seller + their shop
      (owner_type = 'seller'
       and exists (select 1 from public.profiles
                   where id = seller_id and role = 'seller' and verification_status = 'verified')
       and exists (select 1 from public.seller_shops s where s.id = shop_id and s.seller_id = seller_id))
    )
  );

-- ============================================================
-- STEP 7: replace public SELECT policies (add hidden_by_admin)
-- ============================================================
-- Public queries must exclude hidden products. Admin-owned products
-- (shop_id IS NULL) are included in public views when not hidden
-- and when their status is approved and active.

-- === products ===

drop policy if exists "Public can view approved products" on public.products;

create policy "Public can view approved products"
  on public.products for select using (
    status = 'approved'
    and is_active
    and hidden_by_admin = false
    and (
      -- seller-owned product: must have an active shop
      (shop_id is not null
       and exists (select 1 from public.seller_shops s where s.id = shop_id and s.status = 'active'))
      or
      -- admin-owned product: no shop requirement
      (shop_id is null and owner_type = 'admin')
    )
    and exists (select 1 from public.categories c where c.id = category_id and c.is_active)
  );

-- === product_images ===

drop policy if exists "Public can view images of public products" on public.product_images;

create policy "Public can view images of public products"
  on public.product_images for select using (
    exists (
      select 1 from public.products p
      join public.categories c on c.id = p.category_id
      where p.id = product_id
        and p.status = 'approved'
        and p.is_active
        and p.hidden_by_admin = false
        and c.is_active
        and (
          (p.shop_id is not null
           and exists (select 1 from public.seller_shops s where s.id = p.shop_id and s.status = 'active'))
          or
          (p.shop_id is null and p.owner_type = 'admin')
        )
    )
  );

-- === product_variants ===

drop policy if exists "Public can view variants of public products" on public.product_variants;

create policy "Public can view variants of public products"
  on public.product_variants for select using (
    is_active and exists (
      select 1 from public.products p
      join public.categories c on c.id = p.category_id
      where p.id = product_id
        and p.status = 'approved'
        and p.is_active
        and p.hidden_by_admin = false
        and c.is_active
        and (
          (p.shop_id is not null
           and exists (select 1 from public.seller_shops s where s.id = p.shop_id and s.status = 'active'))
          or
          (p.shop_id is null and p.owner_type = 'admin')
        )
    )
  );

-- ============================================================
-- STEP 8: index for efficient hidden product filtering
-- ============================================================

create index if not exists idx_products_hidden_by_admin
  on public.products (hidden_by_admin)
  where hidden_by_admin = true;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Two ownership types: seller (existing, unchanged behavior)
--   and admin (new, shopless products owned by admin profile).
-- - Hidden products are excluded from ALL public views: products,
--   product_images, product_variants. RLS enforces this at the
--   database level.
-- - Admin hide/restore are secure RPCs: authentication + is_admin()
--   check + SECURITY DEFINER + fixed search_path + audit logging.
-- - Ownership (seller_id, shop_id, owner_type) is immutable via
--   the product guard trigger. Hide/restore do not touch ownership.
-- - Existing seller INSERT requires owner_type = 'seller'.
-- - Admin INSERT supports both admin-owned and seller-owned paths.
-- - RLS remains enabled on all tables. No DELETE policies added.
-- - All existing moderation rules (status transitions, RPC-only
--   approval) are preserved unchanged.
-- - No existing data is modified. All new columns have safe defaults.
--------------------------------------------------------------------
