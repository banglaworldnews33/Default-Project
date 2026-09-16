# NextGen Shop — Marketplace Catalog Architecture (Phase 6)

Real multi-vendor catalog foundation. Migration: `006_marketplace_catalog.sql`.
The legacy demo catalog (`src/data/products.ts` + localStorage, types
`Category`/`Product`) is intentionally untouched and coexists until a
future migration phase. DB-backed types use the `Marketplace*` prefix.

## Table relationships

```
profiles (001/002: id, role, verification_status)
  │ 1:1
  ├─ seller_shops (seller_id UNIQUE → profiles.id, RESTRICT)
  │    │ 1:N
  │    └─ products (shop_id → seller_shops.id RESTRICT,
  │                 seller_id → profiles.id RESTRICT,
  │                 category_id → categories.id RESTRICT)
  │         │ 1:N
  │         ├─ product_images (product_id → products.id CASCADE)
  │         └─ product_variants (product_id → products.id CASCADE)
  └─ categories (parent_id → categories.id RESTRICT, cycle-guarded)
```

Deletes: shops/categories/products are RESTRICT-protected business
records (no client DELETE policies anywhere on them). Images/variants
are subordinate rows and CASCADE with their product. Removal of shops
or categories is a future superuser workflow; the UI offers
deactivate/inactive instead.

## Seller ownership

- Identity ALWAYS derives from `auth.uid()` server-side. No `seller_id`,
  `shop_id`, role, or status value from the browser is ever trusted:
  INSERT/UPDATE policies re-assert `seller_id = auth.uid()` plus shop
  ownership (`EXISTS` on `seller_shops`), and triggers reject any
  `seller_id`/`shop_id`/slug change.
- One shop per seller (`seller_id UNIQUE`). Shop slugs globally unique.
- Seller A receives zero rows of seller B (RLS + grants on every table).

## Product lifecycle

`draft` → `pending_review` → `approved` → (`inactive` ↩ voluntary unlist)
`rejected` → `draft` (fix + resubmit)

- Sellers create `draft` only (INSERT forces it; `approved` via browser
  is rejected by policy AND trigger).
- Sellers move within {draft, pending_review, inactive} freely.
- `approved`/`rejected` happen ONLY inside `moderate_product()`:
  admin-gated, row-locked, flag-gated trigger exemption, audited.
- No client DELETE on products.

## RLS (default deny everywhere)

- PUBLIC: active categories; `active` shops; `approved`+`active`
  products of active shops in active categories (+ their images /
  active variants). Drafts/rejected/inactive invisible.
- SELLER (verified `seller`+`verified` profile, checked per-query via
  EXISTS on profiles — cross-table, recursion-safe): own shop/products/
  images/variants CRUD within the lifecycle above.
- ADMIN: SELECT-all policies via `is_admin()`; category INSERT/UPDATE
  and shop status UPDATE via `is_admin()` policies; product moderation
  RPC-only (no direct admin UPDATE policy on products).
- `anon` holds no grants on any catalog table or RPC.

## Public visibility

`/shop/:shopSlug` shows active shop branding + approved+active products.
Drafts, rejected, inactive, private seller data, earnings, and customer
data are never publicly queryable.

## Admin authority

Reuses `is_admin()` only — no second mechanism. Admins inspect all
catalog rows, manage categories (create/edit/activate; deactivate
instead of delete — RESTRICT would block deletes with products), and
moderate products/shops through audited RPCs/policies. Profile roles
remain trigger-immutable for every writer including admins.

## Inventory source of truth

- Simple products (no variants): `products.stock_quantity` authoritative.
- Variant SKUs: `product_variants.stock_quantity` authoritative per SKU.
- With variants present, available stock reconciles at READ time as the
  active-variant sum; writers must not treat both as independent balances.
- Negatives forbidden by CHECK on both columns. Atomic decrement is
  deferred to the orders phase (no oversell-safe checkout yet).

## Image strategy

`image_url TEXT`, `https://`-only CHECKs. No Supabase Storage buckets
exist in this project, so upload is deferred: sellers paste image links
(client+DB validate the scheme); product forms state this explicitly.
When Storage lands: per-seller namespaced bucket + owner-scoped storage
policies, then swap link inputs for uploaders (same `image_url` column).

## Slug strategy

Globally unique, lowercase `a-z0-9` hyphen slugs for shops, categories,
products (DB CHECK + unique constraints/indexes). Shop/product slugs are
trigger-immutable (stable public URLs). Generated client-side from names
with a random suffix; collisions fail safe on the unique constraint.

## Deferred features (explicitly NOT built)

Server-side pricing/stock revalidation at checkout, atomic stock
decrement, order routing to sellers, commission/wallet math, payouts,
review backend, product DELETE, shop removal, category depth beyond the
16-level guard, full-text search (LIKE filtering for now), public
product-detail page for marketplace items (shop page lists; detail is a
later route), storage-backed uploads.
