-- -----------------------------------------------------
-- Phase: admin catalog write authority + audit + seed categories
-- -----------------------------------------------------
-- WHY this migration exists: the 001-006 model lets admins READ all
-- catalog rows and moderate products via RPC, but no policy permits
-- admin INSERT/UPDATE of products, images, or variants — so an admin
-- console cannot curate the catalog at all. This file adds ONLY
-- is_admin()-gated write paths plus audit coverage and the initial
-- category seed. It changes nothing else:
--
-- - No existing policy, grant, function, trigger, or column is
--   altered. Seller/customer/anon behavior is byte-for-byte identical.
-- - Product moderation (approve/reject) STAYS RPC-only: the product
--   guard trigger from 006 still rejects privileged transitions for
--   EVERY writer including admins, so direct updates can never
--   approve, transfer ownership, or touch moderation columns.
-- - No DELETE policies are added anywhere (deactivate instead).
-- - category DELETE stays impossible (no policy + RESTRICT FKs).
--
-- Apply AFTER 001-007, in order. Idempotent in style (drop-first
-- policies, OR REPLACE function, ON CONFLICT DO NOTHING seeds).
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: admin product INSERT (curated creation, never promotion)
-- ============================================================
-- The target seller must already be verified, the shop must belong
-- to that seller, status is limited to non-live states plus approved
-- (admin-curated launch), and featured/reason smuggling is blocked
-- exactly like the seller path (defense in depth with 006).

drop policy if exists "Admins can insert products" on public.products;

create policy "Admins can insert products"
  on public.products for insert with check (
    public.is_admin()
    and status in ('draft', 'pending_review', 'approved')
    and is_featured = false
    and rejection_reason is null
    and exists (select 1 from public.profiles
                where id = seller_id and role = 'seller' and verification_status = 'verified')
    and exists (select 1 from public.seller_shops s where s.id = shop_id and s.seller_id = seller_id)
  );

-- ============================================================
-- STEP 2: admin product UPDATE (fields only, never privilege)
-- ============================================================
-- Reachability for admins; the 006 guard trigger still blocks
-- id/seller_id/shop_id changes and every non-RPC status transition
-- (including ->approved), so moderation cannot leak into this path.

drop policy if exists "Admins can update products" on public.products;

create policy "Admins can update products"
  on public.products for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- STEP 3: admin images/variants management (view + curate)
-- ============================================================
-- Sellers keep full ownership management (006, untouched). Admins get
-- a parallel is_admin-gated path so the console can add/remove media
-- (e.g. policy-violating images) without touching RLS for others.

drop policy if exists "Admins manage all images" on public.product_images;

create policy "Admins manage all images"
  on public.product_images for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage all variants" on public.product_variants;

create policy "Admins manage all variants"
  on public.product_variants for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- STEP 4: audit trigger for admin catalog writes
-- ============================================================
-- Sellers' own writes must NOT spam the audit log: the WHEN clause
-- restricts firing to admin sessions only. The function is SECURITY
-- DEFINER solely because `authenticated` holds no INSERT privilege on
-- admin_audit_log (by design — no client writes); it inserts a fixed
-- shape and nothing else. Fixed search_path (no injection surface).

create or replace function public.audit_admin_catalog_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_action text;
  v_target uuid;
begin
  if TG_TABLE_NAME = 'products' then
    v_action := case TG_OP
      when 'INSERT' then 'product.admin_create'
      else 'product.admin_update'
    end;
    v_target := new.seller_id;
  else
    v_action := case TG_OP
      when 'INSERT' then 'category.admin_create'
      else 'category.admin_update'
    end;
    v_target := null;
  end if;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values (v_action, auth.uid(), v_target, null);
  return new;
end;
$$;

drop trigger if exists audit_products_admin_write on public.products;
create trigger audit_products_admin_write
  after insert or update on public.products
  for each row
  when (public.is_admin())
  execute function public.audit_admin_catalog_write();

drop trigger if exists audit_categories_admin_write on public.categories;
create trigger audit_categories_admin_write
  after insert or update on public.categories
  for each row
  when (public.is_admin())
  execute function public.audit_admin_catalog_write();

-- ============================================================
-- STEP 5: seed the 16 main marketplace categories (idempotent)
-- ============================================================
-- Slugs are stable: re-runs and pre-existing rows (same slug) are
-- skipped via ON CONFLICT DO NOTHING — never duplicated, never
-- overwritten. Sub/child categories remain admin-created via UI.

insert into public.categories (name, slug, description, is_active, sort_order) values
  ('Fashion & Clothing', 'fashion-clothing', 'Apparel, footwear and fashion essentials', true, 10),
  ('Baby & Moms', 'baby-moms', 'Care for mothers and little ones', true, 20),
  ('Beauty & Personal Care', 'beauty-personal-care', 'Cosmetics, skincare and grooming', true, 30),
  ('Electronics', 'electronics', 'Gadgets, devices and accessories', true, 40),
  ('Home & Living', 'home-living', 'Furniture, decor and home essentials', true, 50),
  ('Kitchen & Dining', 'kitchen-dining', 'Cookware, appliances and dining', true, 60),
  ('Grocery & Food', 'grocery-food', 'Everyday food and household groceries', true, 70),
  ('Sports & Fitness', 'sports-fitness', 'Sports gear and fitness equipment', true, 80),
  ('Toys, Games & Hobbies', 'toys-games-hobbies', 'Toys, games and hobby supplies', true, 90),
  ('Automotive', 'automotive', 'Vehicle parts, care and accessories', true, 100),
  ('Books & Stationery', 'books-stationery', 'Books, office and school supplies', true, 110),
  ('Tools & Hardware', 'tools-hardware', 'Tools, hardware and DIY supplies', true, 120),
  ('Pet Supplies', 'pet-supplies', 'Food, care and accessories for pets', true, 130),
  ('Jewelry & Accessories', 'jewelry-accessories', 'Jewelry, watches and fashion accessories', true, 140),
  ('Health & Wellness', 'health-wellness', 'Wellness, personal care and nutrition', true, 150),
  ('Others', 'others', 'Everything else', true, 160)
on conflict (slug) do nothing;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Admins can curate (insert/update products incl. pre-approved
--   launch, manage images/variants, manage categories) — all gated
--   by is_admin(), all product privilege transitions still blocked
--   by the 006 trigger, moderation still RPC-only.
-- - Every admin catalog write is audit-logged automatically.
-- - 16 main categories seeded idempotently; hierarchy remains
--   admin-managed via UI (no deletes offered or possible).
-- - Seller/customer/anon paths: unchanged. No grant changes were
--   needed (authenticated already holds the required table grants
--   from 002/006; RLS decides per-role as before).
--------------------------------------------------------------------
