-- -----------------------------------------------------
-- Phase 10: super-admin hierarchy + per-admin product codes +
--           admin->seller creation RPC + product-linked audit
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Migration 009 established two ownership types (seller / admin) and
-- audited hide/restore RPCs, but three gaps remain for the
-- authoritative ownership model:
--
-- 1. No hierarchy: EVERY admin can read the full audit log including
--    actor identities. Only a Super Admin may resolve actor identity.
-- 2. No per-admin authorization factor: any admin can INSERT
--    seller-owned products directly. Seller-bound creation now
--    requires a per-admin code verified server-side.
-- 3. No product<->audit link and no seller-safe "Added by Admin"
--    signal: the audit row carries no product_id, and sellers cannot
--    read the audit log at all.
--
-- WHAT this migration does:
-- - super_admins table (no new role value; roles stay exactly
--   customer/seller/admin) + is_super_admin() helper.
-- - admin_product_codes table (bcrypt hashes ONLY, never plaintext)
--   + verify/set/revoke/list RPCs with failure rate-limiting.
-- - admin_create_seller_product() RPC: code-gated, server-validated,
--   actor from auth.uid(), audit-linked creation. Direct admin INSERT
--   of seller-owned products is REMOVED (NextGen/admin-owned direct
--   INSERT stays, unchanged in shape).
-- - admin_audit_log gains product_id + shop_id (nullable, no FKs —
--   same survival philosophy as 003) + SELECT tightened to super
--   admins. Redacted/full audit RPCs serve everyone else.
-- - Seller-safe "Added by Admin" via DEFINER RPC derivation (no new
--   product column, so customer/public responses cannot leak it).
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No change to roles/check constraints in 001 (no 'super_admin'
--   role value anywhere).
-- - No change to seller INSERT/UPDATE policies, public SELECT
--   policies, hide/restore RPCs, media triggers, or grants from
--   001-009 except where stated below.
-- - No email-based authorization, no frontend flags, no VITE_ or
--   localStorage involvement (database-authoritative only).
-- - No DELETE policies added anywhere.
-- - No service_role exposure to the frontend.
-- - No existing data modified. No backfill: products created before
--   this migration keep their existing (unlinked) audit rows.
--
-- BOOTSTRAP (human step, NOT automated here): super_admins starts
-- EMPTY on purpose — no UUID is hardcoded in this file. After
-- review, the owner designates the one Super Admin with a direct
-- owner INSERT (bypasses RLS, same pattern as the 003 admin
-- bootstrap note). Normal admins can NEVER self-insert: there is no
-- client INSERT policy and the management RPCs require
-- is_super_admin().
--
-- Apply AFTER 001-009, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 0: pgcrypto for bcrypt code hashes
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- STEP 1: super_admins table (membership = privilege)
-- ============================================================
-- One row per Super Admin. Empty until the owner bootstrap insert.
-- No client write policies: membership changes ONLY via the
-- super-admin-gated RPCs below (or direct owner SQL).

create table if not exists public.super_admins (
  admin_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.super_admins enable row level security;

-- Visibility policy is created in STEP 2B, AFTER the is_super_admin()
-- helper exists (Postgres validates policy expressions at CREATE
-- time, so the function must exist first).
-- NOTE: intentionally NO insert/update/delete policies on
-- super_admins for any client role.

revoke all on public.super_admins from public, anon;
grant select on public.super_admins to authenticated;

-- ============================================================
-- STEP 2: is_super_admin() helper (recursion-safe, DEFINER)
-- ============================================================
-- Same pattern as is_admin() (002): runs as owner, bypasses RLS,
-- safe to call from policies and RPCs. Answers exactly one
-- question: is the caller a Super Admin?

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.super_admins where admin_id = auth.uid()
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- STEP 2B: super-admin visibility policy (needs the helper above).

drop policy if exists "Super admins can view super admins" on public.super_admins;

create policy "Super admins can view super admins"
  on public.super_admins for select
  using (public.is_super_admin());

-- ============================================================
-- STEP 3: super-admin management RPCs (hierarchy control)
-- ============================================================
-- Only a Super Admin can add/remove Super Admins. Removing the last
-- remaining Super Admin is refused (anti-lockout). Target must hold
-- role='admin' (roles themselves are still trigger-immutable for
-- everyone else; no promotion path is created here).

create or replace function public.add_super_admin(p_target_admin uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise exception 'super admin: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'super admin: super-administrator access required';
  end if;

  select role into v_role from public.profiles where id = p_target_admin;
  if not found then
    raise exception 'super admin: target profile not found';
  end if;
  if v_role <> 'admin' then
    raise exception 'super admin: target must hold the admin role';
  end if;

  insert into public.super_admins (admin_id)
  values (p_target_admin)
  on conflict (admin_id) do nothing;
end;
$$;

revoke all on function public.add_super_admin(uuid) from public, anon, service_role;
grant execute on function public.add_super_admin(uuid) to authenticated;

create or replace function public.remove_super_admin(p_target_admin uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
  v_remaining integer;
begin
  if v_caller is null then
    raise exception 'super admin: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'super admin: super-administrator access required';
  end if;

  delete from public.super_admins where admin_id = p_target_admin;
  if not found then
    raise exception 'super admin: target is not a super admin';
  end if;

  select count(*) into v_remaining from public.super_admins;
  if v_remaining < 1 then
    raise exception 'super admin: cannot remove the last super admin';
  end if;
end;
$$;

revoke all on function public.remove_super_admin(uuid) from public, anon, service_role;
grant execute on function public.remove_super_admin(uuid) to authenticated;

-- ============================================================
-- STEP 4: admin_product_codes (bcrypt hashes only)
-- ============================================================
-- One row per admin allowed to create seller-bound products.
-- code_hash is crypt() output; plaintext NEVER stored, NEVER
-- selected back (no reader returns the hash column), never logged.
-- failed_attempts + locked_until give a cheap server-side
-- rate limit: 10 bad attempts lock the code for 15 minutes.

create table if not exists public.admin_product_codes (
  admin_id uuid primary key references public.profiles (id) on delete cascade,
  code_hash text not null,
  is_active boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.admin_product_codes enable row level security;

-- NOTE: intentionally NO policies on admin_product_codes for any
-- client role. Every access path is a SECURITY DEFINER RPC below
-- (which bypass RLS and never expose the hash). Table is
-- unreachable from PostgREST directly.

revoke all on public.admin_product_codes from public, anon, authenticated, service_role;

drop trigger if exists handle_admin_product_codes_updated_at on public.admin_product_codes;

create trigger handle_admin_product_codes_updated_at
  before update on public.admin_product_codes
  for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 5: code verify / set / revoke / list RPCs
-- ============================================================
-- verify_admin_product_code() raises on ANY failure (fail-secure);
-- it returns void so there is no boolean for callers to misuse.
-- The plaintext travels only as an RPC argument (like a password):
-- it is hashed/compared inside, never stored, never logged.

create or replace function public.verify_admin_product_code(p_code text)
returns void language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_row public.admin_product_codes%rowtype;
begin
  if v_admin_id is null then
    raise exception 'admin code: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'admin code: administrator access required';
  end if;
  if p_code is null or char_length(p_code) = 0 then
    raise exception 'admin code: code required';
  end if;

  select * into v_row
  from public.admin_product_codes
  where admin_id = v_admin_id
  for update;
  if not found then
    raise exception 'admin code: no code configured for this admin';
  end if;
  if not v_row.is_active then
    raise exception 'admin code: code revoked';
  end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    raise exception 'admin code: temporarily locked after repeated failures';
  end if;

  -- crypt()/gen_salt() are schema-qualified (extensions.*) so the
  -- fixed search_path above cannot redirect them.
  if v_row.code_hash <> extensions.crypt(p_code, v_row.code_hash) then
    update public.admin_product_codes
    set failed_attempts = v_row.failed_attempts + 1,
        locked_until = case
          when v_row.failed_attempts + 1 >= 10
          then timezone('utc'::text, now()) + make_interval(mins => 15)
          else null
        end
    where admin_id = v_admin_id;
    raise exception 'admin code: invalid code';
  end if;

  update public.admin_product_codes
  set failed_attempts = 0,
      locked_until = null
  where admin_id = v_admin_id;
end;
$$;

revoke all on function public.verify_admin_product_code(text) from public, anon, service_role;
grant execute on function public.verify_admin_product_code(text) to authenticated;

-- Issue or rotate an admin's code. Super-admin-only. The plaintext
-- is supplied by the super admin (communicate it out-of-band) and
-- only its bcrypt hash is stored. Minimum length enforced.

create or replace function public.set_admin_product_code(p_target_admin uuid, p_new_code text)
returns void language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise exception 'admin code: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'admin code: super-administrator access required';
  end if;
  if p_new_code is null or char_length(p_new_code) < 12 or char_length(p_new_code) > 256 then
    raise exception 'admin code: code must be 12-256 characters';
  end if;

  select role into v_role from public.profiles where id = p_target_admin;
  if not found then
    raise exception 'admin code: target profile not found';
  end if;
  if v_role <> 'admin' then
    raise exception 'admin code: target must hold the admin role';
  end if;

  insert into public.admin_product_codes (admin_id, code_hash, is_active, failed_attempts, locked_until)
  values (p_target_admin, extensions.crypt(p_new_code, extensions.gen_salt('bf', 10)), true, 0, null)
  on conflict (admin_id) do update
  set code_hash = excluded.code_hash,
      is_active = true,
      failed_attempts = 0,
      locked_until = null;
end;
$$;

revoke all on function public.set_admin_product_code(uuid, text) from public, anon, service_role;
grant execute on function public.set_admin_product_code(uuid, text) to authenticated;

-- Revoke (disable) without deleting history of counters.

create or replace function public.revoke_admin_product_code(p_target_admin uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'admin code: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'admin code: super-administrator access required';
  end if;

  update public.admin_product_codes
  set is_active = false
  where admin_id = p_target_admin;
  if not found then
    raise exception 'admin code: no code configured for this admin';
  end if;
end;
$$;

revoke all on function public.revoke_admin_product_code(uuid) from public, anon, service_role;
grant execute on function public.revoke_admin_product_code(uuid) to authenticated;

-- Status list for the super admin. code_hash is NEVER selected.

create or replace function public.list_admin_product_codes()
returns table (
  admin_id uuid,
  is_active boolean,
  failed_attempts integer,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone
)
language sql stable security definer set search_path = public as
$$
  select c.admin_id, c.is_active, c.failed_attempts, c.locked_until, c.updated_at
  from public.admin_product_codes c
  where public.is_super_admin()
  order by c.updated_at desc;
$$;

revoke all on function public.list_admin_product_codes() from public, anon, service_role;
grant execute on function public.list_admin_product_codes() to authenticated;

-- ============================================================
-- STEP 6: audit product/shop link (no FKs, 003 philosophy)
-- ============================================================
-- Lets product.admin_create_for_seller point at the exact product
-- (and shop) without risking audit survival on row deletion.

alter table public.admin_audit_log
  add column if not exists product_id uuid,
  add column if not exists shop_id uuid;

create index if not exists idx_admin_audit_product on public.admin_audit_log (product_id)
  where product_id is not null;

-- ============================================================
-- STEP 7: tighten audit reads to super admins
-- ============================================================
-- Normal admins must NOT resolve actor identity. Direct table reads
-- become super-admin-only; everyone else uses the redacted/full
-- RPCs in STEP 9 (role-enforced inside, definer-executed).

drop policy if exists "Admins can view audit log" on public.admin_audit_log;

create policy "Super admins can view audit log"
  on public.admin_audit_log for select
  using (public.is_super_admin());

-- ============================================================
-- STEP 8: admin_create_seller_product() RPC (code-gated)
-- ============================================================
-- The ONLY path for creating seller-owned products as an admin.
-- Verifies (in order): authentication, admin role, per-admin code
-- (raises; rate-limited), target seller verified, shop belongs to
-- that seller, category exists, safe status. Slug is generated
-- server-side (never trusted from the client). Ownership is forced:
-- owner_type='seller', seller_id=target, shop_id=target shop.
-- Actor comes from auth.uid(); the audit row links product + shop
-- + actor. A tx-local flag suppresses the generic trigger audit row
-- so exactly one (linked) audit row is written for this path.

create or replace function public.admin_create_seller_product(
  p_target_seller uuid,
  p_shop_id uuid,
  p_category_id uuid,
  p_name text,
  p_short_description text,
  p_description text,
  p_sku text,
  p_price numeric,
  p_compare_at_price numeric,
  p_discount_price numeric,
  p_stock_quantity integer,
  p_brand text,
  p_status text,
  p_admin_code text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_role text;
  v_verification text;
  v_shop_seller uuid;
  v_product_id uuid;
  v_slug text;
begin
  if v_admin_id is null then
    raise exception 'admin create: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'admin create: administrator access required';
  end if;

  -- Per-admin code check (raises on missing/invalid/revoked/locked).
  perform public.verify_admin_product_code(p_admin_code);

  if p_status not in ('draft', 'pending_review', 'approved') then
    raise exception 'admin create: invalid initial status';
  end if;
  if p_name is null or char_length(p_name) < 3 or char_length(p_name) > 200 then
    raise exception 'admin create: product name must be 3-200 characters';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'admin create: price must be 0 or more';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'admin create: stock must be 0 or more';
  end if;

  -- Target must be a verified seller (server-read, never client claims).
  select role, verification_status into v_role, v_verification
  from public.profiles
  where id = p_target_seller;
  if not found then
    raise exception 'admin create: target seller not found';
  end if;
  if v_role <> 'seller' or v_verification <> 'verified' then
    raise exception 'admin create: target must be a verified seller';
  end if;

  -- Shop must belong to that seller.
  select seller_id into v_shop_seller
  from public.seller_shops
  where id = p_shop_id;
  if not found then
    raise exception 'admin create: shop not found';
  end if;
  if v_shop_seller is distinct from p_target_seller then
    raise exception 'admin create: shop does not belong to target seller';
  end if;

  -- Category must exist (FK would reject anyway; clean error here).
  perform 1 from public.categories where id = p_category_id;
  if not found then
    raise exception 'admin create: category not found';
  end if;

  -- Server-generated slug: normalized name + random suffix (unique).
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug is null or v_slug = '' then
    v_slug := 'product';
  end if;
  v_slug := substring(v_slug from 1 for 50) || '-' || substring(md5(random()::text) from 1 for 6);

  -- Suppress the generic trigger audit row for this statement; the
  -- linked audit insert below is the record for this path.
  perform set_config('app.admin_product_rpc', 'on', true);

  insert into public.products (
    seller_id, shop_id, category_id, name, slug,
    short_description, description, sku, price,
    compare_at_price, discount_price, stock_quantity,
    brand, status, is_featured, rejection_reason, owner_type
  )
  values (
    p_target_seller, p_shop_id, p_category_id, p_name, v_slug,
    nullif(p_short_description, ''), nullif(p_description, ''), nullif(p_sku, ''),
    p_price, p_compare_at_price, p_discount_price, p_stock_quantity,
    nullif(p_brand, ''), p_status, false, null, 'seller'
  )
  returning id into v_product_id;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id, product_id, shop_id)
  values ('product.admin_create_for_seller', v_admin_id, p_target_seller, null, v_product_id, p_shop_id);

  return v_product_id;
end;
$$;

revoke all on function public.admin_create_seller_product(uuid, uuid, uuid, text, text, text, text, numeric, numeric, numeric, integer, text, text, text) from public, anon, service_role;
grant execute on function public.admin_create_seller_product(uuid, uuid, uuid, text, text, text, text, numeric, numeric, numeric, integer, text, text, text) to authenticated;

-- ============================================================
-- STEP 9: audit RPCs (redacted for admins, full for super)
-- ============================================================
-- Normal admins see WHAT happened per product, never WHO.
-- Only the super-admin RPC resolves admin_id + admin name.
-- Sellers use the flag RPC in STEP 10 (no audit access at all).

create or replace function public.get_product_audit_redacted(p_product_id uuid)
returns table (
  action text,
  product_id uuid,
  target_user_id uuid,
  shop_id uuid,
  created_at timestamp with time zone,
  actor_label text
)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'audit: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'audit: administrator access required';
  end if;
  perform 1 from public.products where id = p_product_id;
  if not found then
    raise exception 'audit: product not found';
  end if;

  return query
  select a.action, a.product_id, a.target_user_id, a.shop_id, a.created_at,
         'Created by Admin'::text
  from public.admin_audit_log a
  where a.product_id = p_product_id
  order by a.created_at desc;
end;
$$;

revoke all on function public.get_product_audit_redacted(uuid) from public, anon, service_role;
grant execute on function public.get_product_audit_redacted(uuid) to authenticated;

create or replace function public.get_product_audit_full(p_product_id uuid)
returns table (
  action text,
  product_id uuid,
  target_user_id uuid,
  shop_id uuid,
  admin_id uuid,
  admin_name text,
  created_at timestamp with time zone
)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'audit: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'audit: super-administrator access required';
  end if;
  perform 1 from public.products where id = p_product_id;
  if not found then
    raise exception 'audit: product not found';
  end if;

  return query
  select a.action, a.product_id, a.target_user_id, a.shop_id,
         a.admin_id, p.name, a.created_at
  from public.admin_audit_log a
  left join public.profiles p on p.id = a.admin_id
  where a.product_id = p_product_id
  order by a.created_at desc;
end;
$$;

revoke all on function public.get_product_audit_full(uuid) from public, anon, service_role;
grant execute on function public.get_product_audit_full(uuid) to authenticated;

-- ============================================================
-- STEP 10: seller-safe "Added by Admin" flag RPC
-- ============================================================
-- Derives the flag server-side from the linked audit (no new
-- product column, so customer/public responses cannot leak it).
-- Callers receive ONLY their own rows, plus a generic boolean —
-- never admin identity. Legacy pre-010 admin-created rows (which
-- have no product-linked audit) report false; no backfill is
-- attempted.

create or replace function public.list_own_products_with_admin_flag()
returns table (
  id uuid,
  seller_id uuid,
  shop_id uuid,
  category_id uuid,
  name text,
  slug text,
  short_description text,
  price numeric,
  stock_quantity integer,
  status text,
  brand text,
  is_active boolean,
  owner_type text,
  hidden_by_admin boolean,
  hidden_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  added_by_admin boolean
)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'products: authentication required';
  end if;

  return query
  select p.id, p.seller_id, p.shop_id, p.category_id, p.name, p.slug,
         p.short_description, p.price, p.stock_quantity, p.status, p.brand,
         p.is_active, p.owner_type, p.hidden_by_admin, p.hidden_at,
         p.created_at, p.updated_at,
         exists (
           select 1 from public.admin_audit_log a
           where a.product_id = p.id
             and a.action = 'product.admin_create_for_seller'
         ) as added_by_admin
  from public.products p
  where p.seller_id = v_caller
  order by p.updated_at desc;
end;
$$;

revoke all on function public.list_own_products_with_admin_flag() from public, anon, service_role;
grant execute on function public.list_own_products_with_admin_flag() to authenticated;

-- ============================================================
-- STEP 11: narrow the direct admin INSERT to NextGen-owned
-- ============================================================
-- Seller-bound admin creation now flows ONLY through the
-- code-gated RPC (STEP 8). The direct policy keeps exactly the
-- admin-owned path (a): caller-owned, shopless, safe status.
-- Seller policies (006/009), public SELECTs (009), admin UPDATE
-- (008), and hide/restore RPCs (009) are untouched.

drop policy if exists "Admins can insert products" on public.products;

create policy "Admins can insert own NextGen products"
  on public.products for insert with check (
    public.is_admin()
    and owner_type = 'admin'
    and seller_id = auth.uid()
    and shop_id is null
    and status in ('draft', 'pending_review', 'approved')
    and is_featured = false
    and rejection_reason is null
  );

-- ============================================================
-- STEP 12: suppress the generic trigger row inside the RPC path
-- ============================================================
-- The RPC writes its own linked audit row; without this, every
-- RPC creation would ALSO emit the generic product.admin_create
-- row (noise + unlinked duplicate). Other admin writes (edits,
-- NextGen creates, moderation-adjacent updates) still audit
-- exactly as before. Trigger bodies are untouched.

drop trigger if exists audit_products_admin_write on public.products;

create trigger audit_products_admin_write
  after insert or update on public.products
  for each row
  when (public.is_admin() and current_setting('app.admin_product_rpc', true) is distinct from 'on')
  execute function public.audit_admin_catalog_write();

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Roles unchanged (customer/seller/admin). Super-admin = row in
--   super_admins, checked by is_super_admin(). No self-promotion:
--   no client writes + gated RPCs + last-admin guard.
-- - Per-admin bcrypt codes, server-verified, rate-limited,
--   super-admin issuance/rotation/revocation, hash never returned.
-- - Seller-bound admin creation is RPC-only (code + server
--   validation + forced seller ownership + linked audit).
-- - Audit: product/shop-linked rows, super-only direct reads,
--   redacted vs full RPCs, immutable (no update/delete policies).
-- - Sellers get a generic boolean via RPC; customers get nothing
--   new (no product columns added anywhere in this migration).
-- - 009 behavior preserved: ownership immutability, visibility
--   RPCs, public policies, seller flows, media guards.
-- -----------------------------------------------------
-- BOOTSTRAP (owner runs AFTER review; NOT automated):
-- 1) Find the admin (read-only):
--      select id, email, role from public.profiles where role = 'admin';
-- 2) Designate the ONE super admin (replace the UUID):
--      insert into public.super_admins (admin_id)
--      values ('PASTE_VERIFIED_ADMIN_UUID');
-- 3) Issue their code channel out-of-band via
--      select public.set_admin_product_code('<uuid>', '<code-12+chars>');
--    (run as a super-admin session; hash only is stored).
-- -----------------------------------------------------
