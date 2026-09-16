-- -----------------------------------------------------
-- Phase 6.5: Cloudinary media metadata + ownership binding
-- (HARDENED FINAL — supersedes the unapplied draft)
-- -----------------------------------------------------
-- Extends product_images and seller_shops with the metadata the
-- secure Cloudinary upload/delete Edge Functions need. Purely
-- additive: no RLS policy, grant, function, trigger, or existing
-- column from 001-006 is modified.
--
-- Design corrections vs the draft:
-- 1. storage_provider has NO default and stays NULL for legacy
--    URL-only rows (a default of 'cloudinary' would mislabel
--    arbitrary external images as Cloudinary-hosted).
-- 2. The NULL-auth bypass is closed explicitly: with no authenticated
--    user, any non-null public_id raises (the old prefix comparison
--    evaluated to NULL and silently passed — fail-open bug, fixed).
-- 3. Prefix matching is replaced by strict structural validation:
--    exactly ngs/<auth.uid()>/<kind>/<entity-id>/<asset>, with kind
--    allowlisted per table/column and the entity segment bound to the
--    actual row (product_id / shop id), plus an ownership EXISTS check
--    against products/seller_shops. No substring-only trust.
-- 4. Triggers validate only on assignment (INSERT, or UPDATE that
--    changes the column), so admin status moderation and legacy
--    updates that leave media columns untouched never trip them.
--
-- What this migration does NOT do (explicit non-goals):
-- - No RLS policy, grant, SECURITY DEFINER function, or existing
--   trigger/function is created, altered, or dropped.
-- - No service_role / anon / public privilege changes at all.
-- - No Cloudinary availability or network dependency: triggers are
--   pure string + catalog checks. They verify AUTHORIZATION (who may
--   attach which id), never file contents — upload validation stays
--   with the Edge Function, Cloudinary config, and client checks.
--
-- Rerun notes: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, and
-- DROP+CREATE trigger statements make replay safe, with one
-- documented exception — if a draft-007 was ever applied (it was
-- not, per project history), its storage_provider DEFAULT must be
-- dropped manually first; this file will not rewrite history.
-- Apply AFTER 001-006, in order.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: product_images metadata columns
-- ============================================================
-- All NULLABLE so legacy URL-only rows keep working unchanged.
-- DB CHECKs are a backstop on impossible/malicious metadata only;
-- they do NOT prove the Cloudinary file itself is valid.

alter table public.product_images
  add column if not exists storage_provider text
    check (storage_provider is null or storage_provider = 'cloudinary'),
  add column if not exists cloudinary_public_id text
    check (cloudinary_public_id is null or char_length(cloudinary_public_id) between 1 and 500),
  add column if not exists width integer
    check (width is null or (width >= 1 and width <= 3000)),
  add column if not exists height integer
    check (height is null or (height >= 1 and height <= 3000)),
  add column if not exists bytes integer
    check (bytes is null or (bytes >= 0 and bytes <= 5242880)),
  add column if not exists format text
    check (format is null or format in ('jpg', 'jpeg', 'png', 'webp'));

-- One asset per slot: the same Cloudinary object must never back two rows.
create unique index if not exists idx_product_images_public_id_unique
  on public.product_images (cloudinary_public_id)
  where cloudinary_public_id is not null;

-- ============================================================
-- STEP 2: seller_shops logo/banner asset anchors
-- ============================================================

alter table public.seller_shops
  add column if not exists logo_public_id text
    check (logo_public_id is null or char_length(logo_public_id) <= 500),
  add column if not exists banner_public_id text
    check (banner_public_id is null or char_length(banner_public_id) <= 500);

-- One asset per shop slot (replacement updates in place, so this
-- never blocks legitimate replace flows).
create unique index if not exists idx_seller_shops_logo_public_id_unique
  on public.seller_shops (logo_public_id)
  where logo_public_id is not null;
create unique index if not exists idx_seller_shops_banner_public_id_unique
  on public.seller_shops (banner_public_id)
  where banner_public_id is not null;

-- ============================================================
-- STEP 3: folder-ownership guard triggers
-- ============================================================
-- Both triggers are plain (invoker-rights) BEFORE ROW triggers with a
-- fixed search_path. No SECURITY DEFINER is needed: they only RAISE.
-- No network calls, no secrets, no input rewriting, no RLS bypass
-- (RLS remains the primary gate; these are independent depth).

create or replace function public.guard_media_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as
$$
declare
  v_uid text := auth.uid()::text;
  v_parts text[];
begin
  -- Only validate on assignment: INSERT, or UPDATE changing the column.
  -- Untouched columns (admin moderation, legacy edits) never trip this.
  if TG_OP = 'UPDATE'
     and new.cloudinary_public_id is not distinct from old.cloudinary_public_id then
    return new;
  end if;
  if new.cloudinary_public_id is null then
    return new;
  end if;

  -- Fail closed without authentication. (NULL auth covers anon without
  -- grants, service_role/owner sessions, and definer contexts: none of
  -- them may attach cloud assets except through paths that set a real
  -- caller JWT. There are no such paths today by design.)
  if v_uid is null then
    raise exception 'product_images: authentication required for cloudinary assets';
  end if;

  -- Strict structure: ngs/<caller-id>/product/<product-id>/<asset>.
  v_parts := string_to_array(new.cloudinary_public_id, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 5
     or v_parts[1] <> 'ngs'
     or v_parts[2] <> v_uid
     or v_parts[3] <> 'product'
     or v_parts[4] <> new.product_id::text
     or v_parts[5] !~ '^[0-9a-f]{8,64}$' then
    raise exception 'product_images: cloudinary_public_id must be ngs/<your-id>/product/<product-id>/<asset>';
  end if;

  -- Ownership consistency with the actual products relationship:
  -- the referenced product must be the caller's own (evaluated under
  -- the caller's RLS, so a foreign product is simply invisible here).
  if not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.seller_id = auth.uid()
  ) then
    raise exception 'product_images: product not owned by caller';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_media_ownership on public.product_images;
create trigger guard_media_ownership
  before insert or update on public.product_images
  for each row execute function public.guard_media_ownership();

create or replace function public.guard_shop_media_ownership()
returns trigger language plpgsql set search_path = public, pg_temp as
$$
declare
  v_uid text := auth.uid()::text;
  v_logo text[];
  v_banner text[];
begin
  -- Logo slot: validate only on assignment; kind locked to shop-logo,
  -- entity locked to this exact shop row, caller locked to its seller.
  if (TG_OP = 'INSERT' or new.logo_public_id is distinct from old.logo_public_id)
     and new.logo_public_id is not null then
    if v_uid is null then
      raise exception 'seller_shops: authentication required for cloudinary assets';
    end if;
    v_logo := string_to_array(new.logo_public_id, '/');
    if coalesce(array_length(v_logo, 1), 0) <> 5
       or v_logo[1] <> 'ngs'
       or v_logo[2] <> v_uid
       or v_logo[3] <> 'shop-logo'
       or v_logo[4] <> new.id::text
       or v_logo[5] !~ '^[0-9a-f]{8,64}$'
       or new.seller_id is distinct from auth.uid() then
      raise exception 'seller_shops: logo_public_id must be ngs/<your-id>/shop-logo/<shop-id>/<asset>';
    end if;
  end if;

  -- Banner slot: same rules, kind locked to shop-banner.
  if (TG_OP = 'INSERT' or new.banner_public_id is distinct from old.banner_public_id)
     and new.banner_public_id is not null then
    if v_uid is null then
      raise exception 'seller_shops: authentication required for cloudinary assets';
    end if;
    v_banner := string_to_array(new.banner_public_id, '/');
    if coalesce(array_length(v_banner, 1), 0) <> 5
       or v_banner[1] <> 'ngs'
       or v_banner[2] <> v_uid
       or v_banner[3] <> 'shop-banner'
       or v_banner[4] <> new.id::text
       or v_banner[5] !~ '^[0-9a-f]{8,64}$'
       or new.seller_id is distinct from auth.uid() then
      raise exception 'seller_shops: banner_public_id must be ngs/<your-id>/shop-banner/<shop-id>/<asset>';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shop_media_ownership on public.seller_shops;
create trigger guard_shop_media_ownership
  before insert or update on public.seller_shops
  for each row execute function public.guard_shop_media_ownership();

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Additive columns only; RLS, grants, definer functions, existing
--   triggers, and all 001-006 columns are byte-for-byte untouched.
-- - Row-based RLS policies automatically cover the wider rows; no new
--   privileges are granted to any role (no GRANT statements at all).
-- - public_id ownership is enforced three-deep: Edge Function
--   composition (server builds the id) AND structural validation AND
--   relationship/ownership checks in the triggers above.
-- - Legacy URL rows (NULL public_id) are untouched and keep working.
--------------------------------------------------------------------
