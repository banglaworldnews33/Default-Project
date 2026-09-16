-- -----------------------------------------------------
-- Phase 22: seller product reviews backend (local only)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Sellers today have NO review backend: SellerReviewsPage is a
-- static placeholder and no product_reviews object exists in
-- 001-021 (verified by grep). This migration adds the minimum
-- secure backend for verified-purchase product reviews WITHOUT
-- touching any existing object:
--
-- - product_reviews table (snapshots, constrained status)
-- - product_rating_stats table (approved-only aggregates)
-- - submit path: submit_product_review() (customer, RPC-only)
-- - seller read path: get_seller_reviews() (approved-only,
--   allowlisted columns, keyset pagination)
-- - seller reply path: reply_seller_review() (RPC-only)
-- - moderation path: moderate_review() (admin-only RPC)
-- - customer read path: get_customer_reviews() (own rows only)
-- - Least-privilege RLS (default deny; RPC-only writes) +
--   grants. No client INSERT/UPDATE/DELETE anywhere.
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No change to 001-021 objects (tables, policies, triggers,
--   RPCs, grants on existing objects are byte-for-byte preserved).
--   In particular financial migrations 017-021 are untouched.
-- - No public storefront review list (a future migration can add
--   a public-approved read RPC reusing the 009 visibility rule).
-- - No review helpful-votes, edits, customer deletes, or seller
--   report-abuse queue (helpful_count is stored, unwritable in v1).
-- - No demo migration: demo Product.rating/reviews fields and
--   localStorage catalog stay untouched; no rating columns are
--   added to products.
-- - No seed/fake/demo review rows.
-- - No service_role frontend use. No dynamic SQL.
--
-- AUTHORITY MODEL (mirrors 006/012/013 precedent):
-- - Grants decide reachability; RLS policies decide visibility;
--   SECURITY DEFINER RPCs derive identity from auth.uid().
-- - No seller_id/customer_id authorization parameter exists on
--   any RPC by construction.
-- - Privileged UPDATE columns are guarded by the
--   guard_review_immutable() trigger. The trusted RPCs set a
--   transaction-local context flag via set_config() — the exact
--   established 006 pattern (app.moderation set ONLY inside
--   moderate_product). A distinct key (app.product_reviews) is
--   used so review flags can never satisfy the product guard and
--   vice versa. PostgREST clients cannot issue SET/SET LOCAL, so
--   the flag is not client-controllable.
--
-- Apply AFTER 001-021, in order. Idempotent in style.
-- LOCAL ONLY: do not db push without explicit authorization.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: product_reviews table
-- ============================================================
-- One row per verified-purchase review. product/order/item/
-- customer linkage is immutable history (RESTRICT everywhere so
-- reviews survive administration). reviewer_name is a snapshot
-- taken at submit time: sellers never join live profiles, so no
-- profile column can widen the seller-visible surface later.
-- title/body are stored VERBATIM (never trimmed); blankness is
-- enforced by validation (RPC fast-fail + table CHECK), not by
-- silent mutation.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text check (body is null or char_length(body) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden', 'rejected')),
  seller_reply text check (seller_reply is null or char_length(seller_reply) <= 2000),
  seller_replied_at timestamp with time zone,
  seller_replied_by uuid references public.profiles (id) on delete set null,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamp with time zone,
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) <= 2000),
  helpful_count integer not null default 0 check (helpful_count >= 0),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  -- At least one of title/body must carry non-whitespace content.
  -- btrim is used for DETECTION only; stored values are verbatim.
  check (btrim(coalesce(title, '') || coalesce(body, '')) <> '')
);

-- ============================================================
-- STEP 2: uniqueness (duplicate prevention, race-safe)
-- ============================================================
-- One review per purchased line (primary anti-duplicate; a repeat
-- purchase legitimately allows a new review). The second index is
-- defense-in-depth. The unique indexes are the race-safe
-- authority: concurrent double-submits resolve to exactly one
-- row plus a clean unique_violation for the loser.

create unique index if not exists idx_reviews_order_item_unique
  on public.product_reviews (order_item_id)
  where order_item_id is not null;

create unique index if not exists idx_reviews_product_customer_order_unique
  on public.product_reviews (product_id, customer_id, order_id)
  where order_id is not null;

-- ============================================================
-- STEP 3: read-path indexes (exactly the approved set)
-- ============================================================

create index if not exists idx_reviews_product_status_created
  on public.product_reviews (product_id, created_at desc, id desc)
  where status = 'approved';

create index if not exists idx_reviews_seller_lookup
  on public.product_reviews (product_id, status, created_at desc);

create index if not exists idx_reviews_customer
  on public.product_reviews (customer_id, created_at desc);

create index if not exists idx_reviews_order_item
  on public.product_reviews (order_item_id);

-- ============================================================
-- STEP 4: updated_at trigger (reuse handle_updated_at, 001/002)
-- ============================================================
-- The helper is reused, never duplicated.

drop trigger if exists handle_product_reviews_updated_at on public.product_reviews;

create trigger handle_product_reviews_updated_at
  before update on public.product_reviews for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 5: RLS — default deny, RPC-only access
-- ============================================================
-- RLS is enabled and NO client policies are created (no SELECT /
-- INSERT / UPDATE / DELETE for any client role):
-- - Sellers read ONLY via get_seller_reviews() (direct SELECT
--   would expose internal linkage columns and is forbidden).
-- - Customers read ONLY via get_customer_reviews() (same reason:
--   direct SELECT * would leak order_item_id/order_id linkage,
--   following the 014 "no direct SELECT *" rationale).
-- - Admins moderate ONLY via moderate_review() (no unrestricted
--   client SELECT * for admins either).
-- - All writes flow through SECURITY DEFINER RPCs, which bypass
--   RLS as owner. Default-deny therefore blocks every direct
--   client read/write while the RPCs keep working.

alter table public.product_reviews enable row level security;

-- ============================================================
-- STEP 6: immutability / security guard
-- ============================================================
-- BEFORE UPDATE trigger. Identity, lineage, reviewer content,
-- rating, counters and created_at are immutable for EVERY
-- writer with NO exception path. Privileged groups open only
-- under their own transaction-local context flag (set ONLY by
-- the matching definer RPC below — clients cannot SET GUCs via
-- PostgREST), each with an independent re-check:
-- - moderation group: flag = 'moderation' AND is_admin().
-- - reply group: flag = 'seller_reply' AND verified-seller AND
--   ownership of the reviewed product re-proven inside the guard
--   (defense in depth: the RPC already proved it).
-- updated_at stays writable (trigger-managed).

create or replace function public.guard_review_immutable()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_ctx text := current_setting('app.product_reviews', true);
  v_verified_seller boolean;
  v_owns_product boolean;
begin
  -- (a) Identity, lineage, reviewer content, counters: immutable.
  if new.id is distinct from old.id
     or new.product_id is distinct from old.product_id
     or new.order_id is distinct from old.order_id
     or new.order_item_id is distinct from old.order_item_id
     or new.customer_id is distinct from old.customer_id
     or new.rating is distinct from old.rating
     or new.reviewer_name is distinct from old.reviewer_name
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at
     or new.helpful_count is distinct from old.helpful_count then
    raise exception 'product_reviews: identity, lineage, content and counters are immutable';
  end if;

  -- (b) Moderation group: admin moderation path only.
  if new.status is distinct from old.status
     or new.moderated_by is distinct from old.moderated_by
     or new.moderated_at is distinct from old.moderated_at
     or new.moderation_reason is distinct from old.moderation_reason then
    if v_ctx is distinct from 'moderation' or not public.is_admin() then
      raise exception 'product_reviews: moderation is admin-only (use moderate_review)';
    end if;
    -- The moderation path must not touch seller reply columns.
    if new.seller_reply is distinct from old.seller_reply
       or new.seller_replied_at is distinct from old.seller_replied_at
       or new.seller_replied_by is distinct from old.seller_replied_by then
      raise exception 'product_reviews: moderation cannot alter seller replies';
    end if;
    return new;
  end if;

  -- (c) Reply group: verified-seller reply path only.
  if new.seller_reply is distinct from old.seller_reply
     or new.seller_replied_at is distinct from old.seller_replied_at
     or new.seller_replied_by is distinct from old.seller_replied_by then
    if v_ctx is distinct from 'seller_reply' then
      raise exception 'product_reviews: seller replies must use reply_seller_review';
    end if;
    select exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'seller' and verification_status = 'verified'
    ) into v_verified_seller;
    select exists (
      select 1 from public.products
      where id = new.product_id and seller_id = auth.uid()
    ) into v_owns_product;
    if not v_verified_seller or not v_owns_product then
      raise exception 'product_reviews: reply not permitted for this seller';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_review_immutable on public.product_reviews;

create trigger guard_review_immutable
  before update on public.product_reviews for each row execute function public.guard_review_immutable();

-- ============================================================
-- STEP 7: submit_product_review() — the ONLY creation path
-- ============================================================
-- Single-transaction, fail-closed. The client supplies ONLY the
-- purchased line reference, a rating, and text. Every identity,
-- ownership, eligibility, and snapshot value is derived
-- server-side; there is nowhere to smuggle a product, order,
-- customer, or seller identifier (no such parameters exist).
-- Eligibility: caller owns the parent order AND the item shows
-- item-level fulfillment_status = 'delivered' (013 per-item
-- stage — the precise signal under partial fulfillment) AND the
-- parent payment is not failed AND the caller is not the
-- product's own seller (self-review block).

create or replace function public.submit_product_review(
  p_order_item_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_customer_id uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_profile_name text;
  v_reviewer text;
  v_recent integer;
  v_review_id uuid;
begin
  -- (1) Authenticated caller only.
  if v_customer_id is null then
    raise exception 'review: authentication required';
  end if;

  -- (2) Input shape (lengths mirror table CHECKs; fail fast with
  -- clean errors instead of constraint noise). Content is stored
  -- verbatim; btrim is detection-only for the non-blank rule.
  if p_order_item_id is null then
    raise exception 'review: order item is required';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'review: rating must be between 1 and 5';
  end if;
  if p_title is not null and char_length(p_title) > 120 then
    raise exception 'review: title must be 120 characters or fewer';
  end if;
  if p_body is not null and char_length(p_body) > 2000 then
    raise exception 'review: body must be 2000 characters or fewer';
  end if;
  if btrim(coalesce(p_title, '') || coalesce(p_body, '')) = '' then
    raise exception 'review: title or body is required';
  end if;

  -- (3) Lock the authoritative item row and resolve its parent.
  select * into v_item
  from public.order_items
  where id = p_order_item_id
  for update;
  if not found then
    raise exception 'review: order item not found';
  end if;

  select * into v_order
  from public.orders
  where id = v_item.order_id;
  if not found then
    raise exception 'review: order not found';
  end if;

  -- (4) Verified purchase: the caller owns the parent order.
  if v_order.customer_id is distinct from v_customer_id then
    raise exception 'review: order item not found';
  end if;

  -- (5) Delivered gate (item-level stage; 013 schema respected).
  if v_item.fulfillment_status is distinct from 'delivered' then
    raise exception 'review: only delivered items can be reviewed';
  end if;

  -- (6) Payment gate: failed payments can never yield reviews.
  if v_order.payment_status = 'failed' then
    raise exception 'review: failed payments cannot be reviewed';
  end if;

  -- (7) Self-review block: sellers cannot review own products.
  if v_item.seller_id = v_customer_id then
    raise exception 'review: sellers cannot review their own products';
  end if;

  -- (8) Friendly duplicate pre-check (the partial unique index in
  -- STEP 2 remains the race-safe authority — see handler below).
  perform 1 from public.product_reviews where order_item_id = p_order_item_id;
  if found then
    raise exception 'review: this item has already been reviewed';
  end if;

  -- (9) v1 rate limit: at most 5 submissions per customer per hour.
  select count(*) into v_recent
  from public.product_reviews
  where customer_id = v_customer_id
    and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'review: too many reviews submitted recently';
  end if;

  -- (10) Reviewer snapshot: authoritative profile name first,
  -- authoritative order customer name as fallback (orders
  -- always carry it: NOT NULL 2-120 in 012). Truncated to the
  -- 80-char column bound; never taken from caller input.
  select name into v_profile_name from public.profiles where id = v_customer_id;
  v_reviewer := left(nullif(btrim(coalesce(v_profile_name, '')), ''), 80);
  if v_reviewer is null then
    v_reviewer := left(nullif(btrim(v_order.customer_name), ''), 80);
  end if;
  if v_reviewer is null then
    raise exception 'review: reviewer name unavailable';
  end if;

  -- (11) Persist as pending (invisible to sellers until moderated).
  -- product_id/order_id/customer_id are taken from the locked
  -- authoritative rows, never from the caller.
  begin
    insert into public.product_reviews (
      product_id, order_id, order_item_id, customer_id,
      reviewer_name, rating, title, body, status
    )
    values (
      v_item.product_id, v_item.order_id, p_order_item_id, v_customer_id,
      v_reviewer, p_rating, p_title, p_body, 'pending'
    )
    returning id into v_review_id;
  exception when unique_violation then
    raise exception 'review: this item has already been reviewed';
  end;

  -- Returns the id only, never the row.
  return v_review_id;
end;
$$;

revoke all on function public.submit_product_review(uuid, smallint, text, text) from public, anon, service_role;
grant execute on function public.submit_product_review(uuid, smallint, text, text) to authenticated;

-- ============================================================
-- STEP 8: get_seller_reviews() — own approved reviews only
-- ============================================================
-- Read-only DEFINER RPC (verified sellers only). Ownership is
-- proven by the join itself: reviews are reached THROUGH
-- seller-owned products (p.seller_id = auth.uid()), so a forged
-- p_product_id only narrows within the caller's own catalog and
-- another seller's reviews match zero rows (indistinguishable
-- from nonexistent — no ownership oracle, 013 pattern).
-- Visibility is hard-coded approved: pending/hidden/rejected can
-- never pass this query. Keyset pagination + limit clamp follow
-- the 021 convention byte-for-byte in spirit.

create or replace function public.get_seller_reviews(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_product_id uuid default null,
  p_rating smallint default null,
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  review_id uuid,
  product_id uuid,
  product_name text,
  rating smallint,
  title text,
  body text,
  reviewer_name text,
  seller_reply text,
  seller_replied_at timestamp with time zone,
  created_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.product_id, p.name, r.rating, r.title, r.body,
         r.reviewer_name, r.seller_reply, r.seller_replied_at, r.created_at
  from public.product_reviews r
  join public.products p on p.id = r.product_id
  join public.profiles s on s.id = auth.uid()
  where r.status = 'approved'
    and p.seller_id = auth.uid()
    and s.role = 'seller'
    and s.verification_status = 'verified'
    and (p_product_id is null or r.product_id = p_product_id)
    and (p_rating is null or (p_rating between 1 and 5 and r.rating = p_rating))
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at <= p_to)
    and (p_from is null or p_to is null or p_from <= p_to)
    and (p_created_before is null
         or p_id_before is null
         or (r.created_at, r.id) < (p_created_before, p_id_before))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_reviews(integer, timestamp with time zone, uuid, uuid, smallint, timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_seller_reviews(integer, timestamp with time zone, uuid, uuid, smallint, timestamp with time zone, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 9: reply_seller_review() — the ONLY reply path
-- ============================================================
-- Narrowly scoped DEFINER RPC. Ownership is re-proven here AND
-- inside guard_review_immutable (defense in depth). Only
-- approved reviews accept replies. Blank/NULL input clears an
-- existing reply (reply + timestamp + author all reset). Status
-- columns are unwritable through this path by construction (no
-- such assignments exist below) and rejected by the guard above.

create or replace function public.reply_seller_review(
  p_review_id uuid,
  p_reply text
)
returns void language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_seller_id uuid := auth.uid();
  v_review public.product_reviews%rowtype;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if v_seller_id is null then
    raise exception 'review reply: authentication required';
  end if;
  perform 1 from public.profiles
  where id = v_seller_id and role = 'seller' and verification_status = 'verified';
  if not found then
    raise exception 'review reply: verified seller access required';
  end if;
  if p_reply is not null and char_length(p_reply) > 2000 then
    raise exception 'review reply: reply must be 2000 characters or fewer';
  end if;
  if p_review_id is null then
    raise exception 'review reply: review not found';
  end if;

  select * into v_review
  from public.product_reviews
  where id = p_review_id
  for update;
  if not found then
    raise exception 'review reply: review not found';
  end if;

  -- Ownership proven by join; identical message keeps foreign or
  -- missing reviews indistinguishable (no oracle).
  perform 1 from public.products
  where id = v_review.product_id and seller_id = v_seller_id;
  if not found then
    raise exception 'review reply: review not found';
  end if;

  if v_review.status is distinct from 'approved' then
    raise exception 'review reply: only approved reviews can receive replies';
  end if;

  -- Trusted reply context for the guard (transaction-local; the
  -- guard additionally re-proves verified-seller + ownership).
  perform set_config('app.product_reviews', 'seller_reply', true);

  update public.product_reviews
  set seller_reply = v_reply,
      seller_replied_at = case when v_reply is null then null else timezone('utc'::text, now()) end,
      seller_replied_by = case when v_reply is null then null else v_seller_id end
  where id = p_review_id;
end;
$$;

revoke all on function public.reply_seller_review(uuid, text) from public, anon, service_role;
grant execute on function public.reply_seller_review(uuid, text) to authenticated;

-- ============================================================
-- STEP 10: moderate_review() — admin-only moderation
-- ============================================================
-- The ONLY status path. is_admin() gate (002 pattern) plus the
-- transaction-local moderation context for the guard (006
-- pattern, distinct key). Allowed transitions are exactly:
-- pending->approved, pending->rejected, approved->hidden,
-- hidden->approved. Rejected is terminal; every other pair
-- (including same-status no-ops) fails closed. Adverse actions
-- (rejected/hidden) require a reason; approvals clear it,
-- mirroring moderate_product's rejection_reason handling.

create or replace function public.moderate_review(
  p_review_id uuid,
  p_decision text,
  p_reason text
)
returns void language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_review public.product_reviews%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_admin_id is null then
    raise exception 'review moderation: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'review moderation: administrator access required';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'hidden') then
    raise exception 'review moderation: decision must be approved, rejected, or hidden';
  end if;
  if p_review_id is null then
    raise exception 'review moderation: review not found';
  end if;
  if (p_decision = 'rejected' or p_decision = 'hidden') and v_reason is null then
    raise exception 'review moderation: a reason is required';
  end if;
  if v_reason is not null and char_length(v_reason) > 2000 then
    raise exception 'review moderation: reason must be 2000 characters or fewer';
  end if;

  select * into v_review
  from public.product_reviews
  where id = p_review_id
  for update;
  if not found then
    raise exception 'review moderation: review not found';
  end if;

  if not (
    (v_review.status = 'pending' and p_decision = 'approved')
    or (v_review.status = 'pending' and p_decision = 'rejected')
    or (v_review.status = 'approved' and p_decision = 'hidden')
    or (v_review.status = 'hidden' and p_decision = 'approved')
  ) then
    raise exception 'review moderation: illegal transition from % to %', v_review.status, p_decision;
  end if;

  -- Trusted moderation context for the guard (transaction-local).
  perform set_config('app.product_reviews', 'moderation', true);

  update public.product_reviews
  set status = p_decision,
      moderated_by = v_admin_id,
      moderated_at = timezone('utc'::text, now()),
      moderation_reason = case when p_decision = 'approved' then null else v_reason end
  where id = p_review_id;
end;
$$;

revoke all on function public.moderate_review(uuid, text, text) from public, anon, service_role;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;

-- ============================================================
-- STEP 11: get_customer_reviews() — own reviews only
-- ============================================================
-- Read-only DEFINER RPC. Ownership (customer_id = auth.uid())
-- is enforced HERE; no customer_id parameter exists. Status IS
-- returned to the owner (lets customers track moderation of
-- their own submissions) — this discloses nothing about anyone
-- else. Internal linkage (order/item ids), seller privates, and
-- moderator identity are absent. Same keyset convention as STEP 8.

create or replace function public.get_customer_reviews(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_product_id uuid default null,
  p_from timestamp with time zone default null,
  p_to timestamp with time zone default null
)
returns table (
  review_id uuid,
  product_id uuid,
  product_name text,
  rating smallint,
  title text,
  body text,
  status text,
  seller_reply text,
  seller_replied_at timestamp with time zone,
  created_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.product_id, p.name, r.rating, r.title, r.body,
         r.status, r.seller_reply, r.seller_replied_at, r.created_at
  from public.product_reviews r
  join public.products p on p.id = r.product_id
  where r.customer_id = auth.uid()
    and (p_product_id is null or r.product_id = p_product_id)
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at <= p_to)
    and (p_from is null or p_to is null or p_from <= p_to)
    and (p_created_before is null
         or p_id_before is null
         or (r.created_at, r.id) < (p_created_before, p_id_before))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_customer_reviews(integer, timestamp with time zone, uuid, uuid, timestamp with time zone, timestamp with time zone) from public, anon, service_role;
grant execute on function public.get_customer_reviews(integer, timestamp with time zone, uuid, uuid, timestamp with time zone, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 12: product_rating_stats + approved-only aggregates
-- ============================================================
-- Separate aggregate table (no rating columns are added to
-- products; demo frontend fields untouched). Counts ONLY
-- status = 'approved' rows.
--
-- DELTA CORRECTNESS NOTE (why no full recompute): rating is
-- guard-immutable and product_id is guard-immutable, so the only
-- aggregate-affecting events are (a) INSERT with status approved
-- (possible only via a trusted path — submit inserts pending),
-- (b) status transitions into/out of approved, (c) hard DELETE
-- of an approved row (no client path exists; handled anyway).
-- Each event adjusts review_count and the matching distribution
-- bucket by exactly ±1, and avg_rating is re-derived from the
-- distribution buckets (exact arithmetic, no table scan). A full
-- COUNT(*)/AVG(*) recompute per moderation event would serialize
-- hot products under concurrent moderation; the delta keeps the
-- trigger O(1) while remaining exactly correct under the
-- enumerated event set above. If rating ever becomes mutable, this
-- trigger MUST be revisited (a simpler recompute would then be
-- the correct choice).

create table if not exists public.product_rating_stats (
  product_id uuid primary key references public.products (id) on delete restrict,
  review_count integer not null default 0 check (review_count >= 0),
  avg_rating numeric(4, 2) not null default 0 check (avg_rating >= 0 and avg_rating <= 5),
  distribution jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb
    check (jsonb_typeof(distribution) = 'object'),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.product_rating_stats enable row level security;
-- No client policies: stats are read through future RPCs and
-- written only by the trigger below (definer/owner context).

drop trigger if exists handle_product_rating_stats_updated_at on public.product_rating_stats;

create trigger handle_product_rating_stats_updated_at
  before update on public.product_rating_stats for each row execute function public.handle_updated_at();

create or replace function public.refresh_product_rating_stats()
returns trigger language plpgsql set search_path = public as
$$
declare
  v_product_id uuid;
  v_rating smallint;
  v_delta integer := 0;
  v_bucket text;
begin
  if TG_OP = 'INSERT' then
    -- Only trusted-path approved inserts affect aggregates;
    -- submit_product_review() inserts pending (no-op here).
    if NEW.status is distinct from 'approved' then
      return NEW;
    end if;
    v_product_id := NEW.product_id;
    v_rating := NEW.rating;
    v_delta := 1;
  elsif TG_OP = 'DELETE' then
    -- No client delete path exists; handled for completeness.
    if OLD.status is distinct from 'approved' then
      return OLD;
    end if;
    v_product_id := OLD.product_id;
    v_rating := OLD.rating;
    v_delta := -1;
  else
    -- UPDATE OF status (trigger fires only on status changes).
    if OLD.status is distinct from NEW.status then
      if OLD.status = 'approved' and NEW.status <> 'approved' then
        v_product_id := NEW.product_id;
        v_rating := OLD.rating;
        v_delta := -1;
      elsif OLD.status <> 'approved' and NEW.status = 'approved' then
        v_product_id := NEW.product_id;
        v_rating := NEW.rating;
        v_delta := 1;
      else
        -- Non-approved <-> non-approved (e.g. pending->rejected,
        -- hidden stays hidden): no aggregate effect.
        return NEW;
      end if;
    else
      return NEW;
    end if;
  end if;

  if v_delta = 0 then
    return coalesce(NEW, OLD);
  end if;

  v_bucket := v_rating::text;

  -- Ensure the stats row, then apply the exact delta.
  insert into public.product_rating_stats (product_id)
  values (v_product_id)
  on conflict (product_id) do nothing;

  update public.product_rating_stats s
  set distribution = jsonb_set(
        s.distribution,
        array[v_bucket],
        to_jsonb(greatest(coalesce((s.distribution ->> v_bucket)::integer, 0) + v_delta, 0)),
        true
      ),
      review_count = greatest(s.review_count + v_delta, 0),
      updated_at = timezone('utc'::text, now())
  where s.product_id = v_product_id;

  -- Re-derive the average from the buckets (exact, scan-free).
  update public.product_rating_stats s
  set avg_rating = case
        when s.review_count <= 0 then 0
        else round(
          (coalesce((s.distribution ->> '1')::integer, 0) * 1
           + coalesce((s.distribution ->> '2')::integer, 0) * 2
           + coalesce((s.distribution ->> '3')::integer, 0) * 3
           + coalesce((s.distribution ->> '4')::integer, 0) * 4
           + coalesce((s.distribution ->> '5')::integer, 0) * 5)::numeric
          / s.review_count, 2)
      end
  where s.product_id = v_product_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists refresh_product_rating_stats on public.product_reviews;

create trigger refresh_product_rating_stats
  after insert or delete or update of status on public.product_reviews
  for each row execute function public.refresh_product_rating_stats();

-- ============================================================
-- STEP 13: least-privilege GRANTs (new objects only)
-- ============================================================
-- Tables: RPC-only access, so NO client table grants exist for
-- any role (not even SELECT — there are no policies, and the
-- definer RPCs bypass RLS as owner). 001-021 grants untouched.

revoke all on public.product_reviews from public, anon, authenticated, service_role;
revoke all on public.product_rating_stats from public, anon, authenticated, service_role;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - product_reviews: snapshots + constrained lifecycle
--   (pending/approved/hidden/rejected), RLS default-deny with
--   zero client policies, verbatim content + blank-detection
--   CHECK, RESTRICT lineage, partial-unique anti-duplicates.
-- - guard_review_immutable(): identity/content/counters always
--   immutable; moderation group needs transaction-local
--   'moderation' flag + is_admin(); reply group needs
--   transaction-local 'seller_reply' flag + verified-seller +
--   product ownership (distinct GUC key from 006's
--   app.moderation; unsettable by PostgREST clients).
-- - submit_product_review(): auth-derived customer, locked item,
--   order ownership, item-delivered + non-failed-payment gates,
--   self-review block, duplicate pre-check + unique authority,
--   5/hour rate limit, profile-snapshot name, pending-only
--   insert, id-only return.
-- - get_seller_reviews(): verified-seller gate, ownership via
--   products join, hard-coded approved, allowlisted columns,
--   tuple keyset + clamped limit, fail-closed filters, no oracle.
-- - reply_seller_review(): verified-seller + ownership + approved
--   gate, blank-clears semantics, no status writes.
-- - moderate_review(): is_admin gate, exact 4-transition table,
--   rejected terminal, reason required on adverse actions.
-- - get_customer_reviews(): own rows, status visible to owner,
--   no linkage/seller/moderator internals.
-- - product_rating_stats: approved-only O(1) delta aggregates
--   with documented correctness argument; no products change.
-- - EXECUTE to authenticated only; PUBLIC/anon/service_role
--   explicitly revoked on every RPC. No dynamic SQL. Fixed
--   search_path on every definer function.
-- -----------------------------------------------------
