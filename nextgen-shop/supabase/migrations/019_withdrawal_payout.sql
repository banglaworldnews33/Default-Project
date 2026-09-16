-- -----------------------------------------------------
-- Phase 25: seller withdrawal + admin payout system
-- (reservation-backed requests, admin-gated payouts,
-- compensating releases; no refunds, no gateway work)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Earnings exist (023) and balances derive (024), but no
-- seller can move money: withdrawal requests, approval,
-- payout, failure handling, and reservation accounting are
-- all missing. This migration adds the complete internal
-- payout foundation WITHOUT touching gateways (no APIs,
-- keys, webhooks, HTTP) and WITHOUT refunds (future phase):
--
-- - withdrawal_requests (state-machine request rows)
-- - reservation/release/payout ledger legs (append-only)
-- - request/approve/reject/start/complete/fail RPCs
-- - seller + admin withdrawal read RPCs
-- - reservation-aware financial summaries (024 superseded)
-- - audit linkage for every admin financial action
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No refunds, refund RPCs, or paid -> refunded movement
--   (the 022 guard trigger still rejects it).
-- - No stored authoritative balances anywhere.
-- - No gateway/API integration of any kind.
-- - No change to 001-018 files; 018 summary RPCs are
--   superseded here via CREATE OR REPLACE (011 pattern).
-- - No commission rule or payment verification changes.
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- MONEY RULE: numeric(12,2) everywhere; every amount derives
-- server-side (locked rows, aggregates); the browser never
-- supplies balances, totals, or identities.
--
-- RESERVATION MODEL (single consistent rule): funds lock at
-- REQUEST time via an immutable 'reservation' leg (-amount),
-- so concurrent requests cannot overspend. Approval re-checks
-- capacity; rejection/failure unlock via 'reservation_release'
-- (+amount); completion pairs 'payout' (-amount) with its
-- release, leaving a permanent -amount trail. Available =
-- cleared earnings + all non-earning legs (reservations,
-- releases, payouts), derived — never stored.
--
-- Apply AFTER 001-018, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: extend ledger vocabulary for payout accounting
-- ============================================================
-- 017 CHECKs name single-column constraints
-- ledger_entries_{column}_check (deterministic Postgres
-- convention); they are replaced here with explicit names so
-- future phases never depend on generated identifiers again.

alter table public.ledger_entries
  drop constraint if exists ledger_entries_entry_type_check;

alter table public.ledger_entries
  add constraint ledger_entry_type_check
  check (entry_type in (
    'earning', 'commission', 'adjustment', 'refund',
    'reversal', 'payout', 'payout_reversal',
    'reservation', 'reservation_release'
  ));

alter table public.ledger_entries
  drop constraint if exists ledger_entries_source_check;

alter table public.ledger_entries
  add constraint ledger_source_check
  check (source in (
    'earning_recognition', 'withdrawal_reservation',
    'reservation_release', 'payout_completion'
  ));

-- ============================================================
-- STEP 2: withdrawal_requests (state-machine request rows)
-- ============================================================
-- One row per seller payout request. Money never lives here:
-- amounts lock via reservation legs; this table is workflow
-- state + references only. Timestamps are explicit per state
-- (no status rewind, ever).

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'processing', 'completed', 'rejected', 'failed'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 100),
  external_reference text check (external_reference is null or char_length(external_reference) between 1 and 200),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 2000),
  failure_reason text check (failure_reason is null or char_length(failure_reason) between 1 and 2000),
  approved_by uuid,
  processing_by uuid,
  completed_by uuid,
  rejected_by uuid,
  failed_by uuid,
  approved_at timestamp with time zone,
  processing_at timestamp with time zone,
  completed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (seller_id, idempotency_key)
);

-- One active (money-locking) request per seller. This single
-- constraint, enforced at the database level, is what makes
-- concurrent overspend structurally impossible.
create unique index if not exists idx_withdrawals_one_active
  on public.withdrawal_requests (seller_id)
  where status in ('pending', 'approved', 'processing');

create index if not exists idx_withdrawals_seller on public.withdrawal_requests (seller_id);
create index if not exists idx_withdrawals_status_created
  on public.withdrawal_requests (status, created_at desc);

drop trigger if exists handle_withdrawals_updated_at on public.withdrawal_requests;

create trigger handle_withdrawals_updated_at
  before update on public.withdrawal_requests
  for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 3: RLS (default deny; least privilege per role)
-- ============================================================
-- Sellers read own requests only. Admins read all (existing
-- is_admin() model; commission config stays super-admin and
-- untouched). No INSERT/UPDATE/DELETE policies for any
-- client role: every write runs inside the RPCs below.

alter table public.withdrawal_requests enable row level security;

drop policy if exists "Sellers can view own withdrawals" on public.withdrawal_requests;

create policy "Sellers can view own withdrawals"
  on public.withdrawal_requests for select
  using (seller_id = auth.uid());

drop policy if exists "Admins can view all withdrawals" on public.withdrawal_requests;

create policy "Admins can view all withdrawals"
  on public.withdrawal_requests for select
  using (public.is_admin());

-- NOTE: intentionally NO insert/update/delete policies for
-- any client role.

revoke all on public.withdrawal_requests from public, anon;
grant select on public.withdrawal_requests to authenticated;

-- ============================================================
-- STEP 4: withdrawal transition guard (binds every writer,
-- including service_role, which bypasses RLS but not triggers)
-- ============================================================
-- Only the legal state machine may pass, terminal states have
-- no exits, and workflow identity columns (id, seller, amount,
-- currency, idempotency key, creation time) are frozen. The
-- RPCs below perform exactly these transitions; anything else
-- — including direct service_role edits — is rejected here.

create or replace function public.guard_withdrawal_transition()
returns trigger language plpgsql set search_path = public as
$$
begin
  if TG_OP = 'DELETE' then
    raise exception 'withdrawal_requests: withdrawal records are never deleted';
  end if;
  if new.id is distinct from old.id
     or new.seller_id is distinct from old.seller_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'withdrawal_requests: request identity and amount are immutable';
  end if;
  if (old.status = 'pending' and new.status in ('approved', 'rejected'))
     or (old.status = 'approved' and new.status = 'processing')
     or (old.status = 'processing' and new.status in ('completed', 'failed')) then
    return new;
  end if;
  raise exception 'withdrawal_requests: illegal status transition';
  return null;
end;
$$;

drop trigger if exists guard_withdrawal_transition on public.withdrawal_requests;

create trigger guard_withdrawal_transition
  before update or delete on public.withdrawal_requests
  for each row execute function public.guard_withdrawal_transition();

-- ============================================================
-- STEP 5: audit linkage for withdrawal references
-- ============================================================
-- Additive nullable column (013 precedent): lets payout audit
-- rows point at the exact request without risking audit
-- survival on row deletion.

alter table public.admin_audit_log
  add column if not exists withdrawal_id uuid;

create index if not exists idx_admin_audit_withdrawal on public.admin_audit_log (withdrawal_id)
  where withdrawal_id is not null;

-- ============================================================
-- STEP 6: request_withdrawal() — seller reservation entry point
-- ============================================================
-- Verified sellers only, identity from auth.uid(). Per-seller
-- advisory lock serializes concurrent requests; the partial
-- unique index backstops any residual race with a clean
-- denial (never a double reservation). Idempotency key
-- returns the original request (first write wins, even across
-- differing amounts). Funds lock immediately via a
-- 'reservation' leg so approval-time capacity is already
-- guaranteed, then re-checked at approval anyway.

create or replace function public.request_withdrawal(
  p_amount numeric,
  p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_seller uuid := auth.uid();
  v_amount numeric(12, 2);
  v_available numeric(12, 2);
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- (1) Authenticated verified seller only.
  if v_seller is null then
    raise exception 'withdrawal: authentication required';
  end if;
  perform 1 from public.profiles
  where id = v_seller and role = 'seller' and verification_status = 'verified';
  if not found then
    raise exception 'withdrawal: verified seller access required';
  end if;

  -- (2) Amount + key shape. NaN/infinity cannot arrive as JSON
  -- numbers; scale and bounds are enforced here regardless.
  if p_amount is null or p_amount <= 0 or p_amount < 500 then
    raise exception 'withdrawal: minimum withdrawal is BDT 500';
  end if;
  if trunc(p_amount, 2) <> p_amount then
    raise exception 'withdrawal: amount must have at most 2 decimal places';
  end if;
  v_amount := p_amount::numeric(12, 2);
  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 1
     or char_length(p_idempotency_key) > 100 then
    raise exception 'withdrawal: idempotency key must be 1-100 characters';
  end if;

  -- (3) Serialize this seller's requests within the transaction.
  perform pg_advisory_xact_lock(hashtext('withdrawal:' || v_seller::text));

  -- (4) Replay-first idempotency: same seller + key returns the
  -- original request with no new rows and no state change.
  select id into v_existing_id
  from public.withdrawal_requests
  where seller_id = v_seller
    and idempotency_key = p_idempotency_key;
  if found then
    return v_existing_id;
  end if;

  -- (5) One active money-locking request per seller.
  if exists (
    select 1 from public.withdrawal_requests
    where seller_id = v_seller
      and status in ('pending', 'approved', 'processing')
  ) then
    raise exception 'withdrawal: you already have an active withdrawal request';
  end if;

  -- (6) Capacity from derived ledger state: cleared earnings
  -- plus every non-earning leg (reservations, releases,
  -- payouts). Nothing from the browser participates.
  select
    coalesce(sum(l.net_amount) filter (
      where l.entry_type = 'earning'
        and l.created_at <= now() - interval '7 days'), 0)
    + coalesce(sum(l.amount) filter (
      where l.entry_type <> 'earning'), 0)
  into v_available
  from public.ledger_entries l
  where l.seller_id = v_seller;
  if v_available is null or v_available < v_amount then
    raise exception 'withdrawal: insufficient available balance';
  end if;

  -- (7) Persist request + reservation leg atomically. The leg
  -- locks funds immediately; unique guards converge races.
  v_new_id := gen_random_uuid();
  begin
    insert into public.withdrawal_requests
      (id, seller_id, amount, currency, status, idempotency_key)
    values
      (v_new_id, v_seller, v_amount, 'BDT', 'pending', p_idempotency_key);

    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata
    )
    values (
      v_seller, null, null, 'reservation',
      -v_amount, 'BDT', null, null,
      null, null, 0, null,
      'reservation:' || v_new_id::text, 'withdrawal_reservation', null
    );
  exception when unique_violation then
    -- Lost a race (active-request or key conflict): return the
    -- conflicting original rather than double-reserving.
    select id into v_existing_id
    from public.withdrawal_requests
    where seller_id = v_seller
      and (idempotency_key = p_idempotency_key
           or status in ('pending', 'approved', 'processing'))
    order by (idempotency_key = p_idempotency_key) desc, created_at desc
    limit 1;
    if found then
      return v_existing_id;
    end if;
    raise;
  end;

  return v_new_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric, text) from public, anon, service_role;
grant execute on function public.request_withdrawal(numeric, text) to authenticated;

-- ============================================================
-- STEP 7: approve_withdrawal() — admin capacity re-check
-- ============================================================
-- Never assumes request-time capacity survived: reservation
-- leg presence plus non-negative derived availability are
-- re-verified transactionally. Retries on an approved row
-- return it silently (no duplicate audit).

create or replace function public.approve_withdrawal(p_withdrawal_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
  v_available numeric(12, 2);
begin
  if v_admin_id is null then
    raise exception 'withdrawal: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'withdrawal: administrator access required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    raise exception 'withdrawal: request not found';
  end if;
  if v_req.status = 'approved' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'withdrawal: only pending requests can be approved';
  end if;

  -- Reservation created at request time must still be intact,
  -- and derived books must still balance.
  perform 1 from public.ledger_entries
  where reference_key = 'reservation:' || v_req.id::text;
  if not found then
    raise exception 'withdrawal: reservation record missing';
  end if;
  select
    coalesce(sum(l.net_amount) filter (
      where l.entry_type = 'earning'
        and l.created_at <= now() - interval '7 days'), 0)
    + coalesce(sum(l.amount) filter (
      where l.entry_type <> 'earning'), 0)
  into v_available
  from public.ledger_entries l
  where l.seller_id = v_req.seller_id;
  if v_available is null or v_available < 0 then
    raise exception 'withdrawal: insufficient available balance';
  end if;

  update public.withdrawal_requests
  set status = 'approved',
      approved_by = v_admin_id,
      approved_at = timezone('utc'::text, now())
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id)
  values
    ('withdrawal.approved', v_admin_id, null, null, null, null, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.approve_withdrawal(uuid) from public, anon, service_role;
grant execute on function public.approve_withdrawal(uuid) to authenticated;

-- ============================================================
-- STEP 8: reject_withdrawal() — pending only, funds released
-- ============================================================

create or replace function public.reject_withdrawal(p_withdrawal_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
begin
  if v_admin_id is null then
    raise exception 'withdrawal: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'withdrawal: administrator access required';
  end if;
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 2000 then
    raise exception 'withdrawal: rejection reason is required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    raise exception 'withdrawal: request not found';
  end if;
  if v_req.status = 'rejected' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'withdrawal: only pending requests can be rejected';
  end if;

  insert into public.ledger_entries (
    seller_id, order_id, order_item_id, entry_type,
    amount, currency, commission_rule_id, commission_rate,
    gross_amount, commission_amount, discount_amount, net_amount,
    reference_key, source, metadata
  )
  values (
    v_req.seller_id, null, null, 'reservation_release',
    v_req.amount, 'BDT', null, null,
    null, null, 0, null,
    'release:' || v_req.id::text, 'reservation_release', null
  );

  update public.withdrawal_requests
  set status = 'rejected',
      rejected_by = v_admin_id,
      rejected_at = timezone('utc'::text, now()),
      rejection_reason = p_reason
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id)
  values
    ('withdrawal.rejected', v_admin_id, null, null, null, null, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.reject_withdrawal(uuid, text) from public, anon, service_role;
grant execute on function public.reject_withdrawal(uuid, text) to authenticated;

-- ============================================================
-- STEP 9: start_payout() — approved -> processing
-- ============================================================

create or replace function public.start_payout(p_withdrawal_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
begin
  if v_admin_id is null then
    raise exception 'withdrawal: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'withdrawal: administrator access required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    raise exception 'withdrawal: request not found';
  end if;
  if v_req.status = 'processing' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'approved' then
    raise exception 'withdrawal: only approved requests can start processing';
  end if;

  update public.withdrawal_requests
  set status = 'processing',
      processing_by = v_admin_id,
      processing_at = timezone('utc'::text, now())
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id)
  values
    ('withdrawal.processing', v_admin_id, null, null, null, null, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.start_payout(uuid) from public, anon, service_role;
grant execute on function public.start_payout(uuid) to authenticated;

-- ============================================================
-- STEP 10: complete_payout() — processing -> completed
-- ============================================================
-- Amount comes from the locked request row, never the caller.
-- A reference is mandatory (manual transfer references are
-- acceptable; provider integrations arrive in a later phase).
-- The permanent trail is reservation (-X) + release (+X) +
-- payout (-X): net -X with every step explicit. Retries on a
-- completed row return it; leg conflicts converge the same way.

create or replace function public.complete_payout(
  p_withdrawal_id uuid,
  p_external_reference text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
begin
  if v_admin_id is null then
    raise exception 'withdrawal: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'withdrawal: administrator access required';
  end if;
  if p_external_reference is null
     or char_length(p_external_reference) < 1
     or char_length(p_external_reference) > 200 then
    raise exception 'withdrawal: external payout reference is required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    raise exception 'withdrawal: request not found';
  end if;
  if v_req.status = 'completed' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'processing' then
    raise exception 'withdrawal: only processing payouts can be completed';
  end if;

  begin
    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata
    )
    values
      (v_req.seller_id, null, null, 'payout',
       -v_req.amount, 'BDT', null, null,
       null, null, 0, null,
       'payout:' || v_req.id::text, 'payout_completion', null),
      (v_req.seller_id, null, null, 'reservation_release',
       v_req.amount, 'BDT', null, null,
       null, null, 0, null,
       'release:' || v_req.id::text, 'reservation_release', null);
  exception when unique_violation then
    -- A prior attempt already wrote the legs: fall through to
    -- the state advance below (still guarded by the row lock).
    null;
  end;

  update public.withdrawal_requests
  set status = 'completed',
      completed_by = v_admin_id,
      completed_at = timezone('utc'::text, now()),
      external_reference = p_external_reference
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id)
  values
    ('payout.completed', v_admin_id, null, null, null, null, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.complete_payout(uuid, text) from public, anon, service_role;
grant execute on function public.complete_payout(uuid, text) to authenticated;

-- ============================================================
-- STEP 11: fail_payout() — processing -> failed, funds released
-- ============================================================
-- The release leg restores availability; the reservation and
-- its release remain as permanent history. No row is edited.

create or replace function public.fail_payout(p_withdrawal_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
begin
  if v_admin_id is null then
    raise exception 'withdrawal: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'withdrawal: administrator access required';
  end if;
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 2000 then
    raise exception 'withdrawal: failure reason is required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if not found then
    raise exception 'withdrawal: request not found';
  end if;
  if v_req.status = 'failed' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'processing' then
    raise exception 'withdrawal: only processing payouts can be marked failed';
  end if;

  begin
    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata
    )
    values (
      v_req.seller_id, null, null, 'reservation_release',
      v_req.amount, 'BDT', null, null,
      null, null, 0, null,
      'release:' || v_req.id::text, 'reservation_release', null
    );
  exception when unique_violation then
    -- Release already recorded: state advance below still applies.
    null;
  end;

  update public.withdrawal_requests
  set status = 'failed',
      failed_by = v_admin_id,
      failed_at = timezone('utc'::text, now()),
      failure_reason = p_reason
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id)
  values
    ('payout.failed', v_admin_id, null, null, null, null, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.fail_payout(uuid, text) from public, anon, service_role;
grant execute on function public.fail_payout(uuid, text) to authenticated;

-- ============================================================
-- STEP 12: withdrawal read RPCs (seller own + admin all)
-- ============================================================
-- Verified-seller scoping via auth.uid(); admin reads via
-- is_admin(). Keyset pagination (created_at DESC, id DESC)
-- for sellers; the admin variant adds an optional validated
-- status filter. No customer PII, no secrets — references,
-- amounts, statuses, timestamps, and safe reason text only.

create or replace function public.get_seller_withdrawals(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null
)
returns table (
  withdrawal_id uuid,
  amount numeric,
  currency text,
  status text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  processing_at timestamp with time zone,
  completed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  failed_at timestamp with time zone,
  rejection_reason text,
  failure_reason text,
  external_reference text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select w.id, w.amount, w.currency, w.status, w.created_at,
         w.approved_at, w.processing_at, w.completed_at,
         w.rejected_at, w.failed_at,
         w.rejection_reason, w.failure_reason, w.external_reference
  from public.withdrawal_requests w
  join public.profiles p on p.id = auth.uid()
  where w.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_created_before is null
         or p_id_before is null
         or (w.created_at, w.id) < (p_created_before, p_id_before))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_withdrawals(integer, timestamp with time zone, uuid) from public, anon, service_role;
grant execute on function public.get_seller_withdrawals(integer, timestamp with time zone, uuid) to authenticated;

create or replace function public.get_admin_withdrawals(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_status text default null
)
returns table (
  withdrawal_id uuid,
  seller_id uuid,
  shop_name text,
  amount numeric,
  currency text,
  status text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  processing_at timestamp with time zone,
  completed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  failed_at timestamp with time zone,
  rejection_reason text,
  failure_reason text,
  external_reference text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select w.id, w.seller_id, s.shop_name, w.amount, w.currency, w.status,
         w.created_at, w.approved_at, w.processing_at, w.completed_at,
         w.rejected_at, w.failed_at,
         w.rejection_reason, w.failure_reason, w.external_reference
  from public.withdrawal_requests w
  left join public.seller_shops s on s.seller_id = w.seller_id
  where public.is_admin()
    and (p_status is null
         or (p_status in ('pending', 'approved', 'processing', 'completed', 'rejected', 'failed')
             and w.status = p_status))
    and (p_created_before is null
         or p_id_before is null
         or (w.created_at, w.id) < (p_created_before, p_id_before))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_withdrawals(integer, timestamp with time zone, uuid, text) from public, anon, service_role;
grant execute on function public.get_admin_withdrawals(integer, timestamp with time zone, uuid, text) to authenticated;

-- ============================================================
-- STEP 13: reservation-aware financial summaries (018 superseded)
-- ============================================================
-- Available now means cleared earnings PLUS every non-earning
-- leg (reservations lock, releases/payouts settle), so active
-- requests immediately reduce withdrawable capacity without
-- any stored balance. reserved_amount exposes the locked
-- slice explicitly. Pending/total/commission definitions are
-- unchanged. Same signatures plus one appended column, so
-- existing readers keep working.

drop function if exists public.get_seller_financial_summary();

create or replace function public.get_seller_financial_summary()
returns table (
  total_earnings numeric,
  total_commission numeric,
  pending_earnings numeric,
  available_balance numeric,
  currency text,
  earning_count bigint,
  last_earning_at timestamp with time zone,
  reserved_amount numeric
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'earning'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at <= now() - interval '7 days'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type <> 'earning'), 0),
         l.currency,
         count(*) filter (where l.entry_type = 'earning'),
         max(l.created_at) filter (where l.entry_type = 'earning'),
         coalesce((
           select sum(w.amount)
           from public.withdrawal_requests w
           where w.seller_id = auth.uid()
             and w.status in ('pending', 'approved', 'processing')
         ), 0)
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
  group by l.currency;
$$;

revoke all on function public.get_seller_financial_summary() from public, anon, service_role;
grant execute on function public.get_seller_financial_summary() to authenticated;

create or replace function public.get_admin_financial_summary()
returns table (
  total_earnings numeric,
  total_commission numeric,
  pending_earnings numeric,
  available_earnings numeric,
  earning_count bigint,
  sellers_with_earnings bigint,
  currency text
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'earning'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at <= now() - interval '7 days'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type <> 'earning'), 0),
         count(*) filter (where l.entry_type = 'earning'),
         count(distinct l.seller_id) filter (where l.entry_type = 'earning'),
         l.currency
  from public.ledger_entries l
  where public.is_admin()
  group by l.currency;
$$;

revoke all on function public.get_admin_financial_summary() from public, anon, service_role;
grant execute on function public.get_admin_financial_summary() to authenticated;

drop function if exists public.get_admin_seller_financials(integer, uuid);

create or replace function public.get_admin_seller_financials(
  p_limit integer default 25,
  p_seller_before uuid default null
)
returns table (
  seller_id uuid,
  shop_name text,
  total_earnings numeric,
  pending_earnings numeric,
  available_earnings numeric,
  total_commission numeric,
  earning_count bigint,
  currency text,
  reserved_amount numeric
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select l.seller_id,
         s.shop_name,
         coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at > now() - interval '7 days'), 0),
         coalesce(sum(l.net_amount) filter (
           where l.entry_type = 'earning'
             and l.created_at <= now() - interval '7 days'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type <> 'earning'), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'earning'), 0),
         count(*) filter (where l.entry_type = 'earning'),
         l.currency,
         coalesce((
           select sum(w.amount)
           from public.withdrawal_requests w
           where w.seller_id = l.seller_id
             and w.status in ('pending', 'approved', 'processing')
         ), 0)
  from public.ledger_entries l
  left join public.seller_shops s on s.seller_id = l.seller_id
  where public.is_admin()
    and (p_seller_before is null or l.seller_id > p_seller_before)
  group by l.seller_id, s.shop_name, l.currency
  order by l.seller_id asc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_seller_financials(integer, uuid) from public, anon, service_role;
grant execute on function public.get_admin_seller_financials(integer, uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - withdrawal_requests: state-machine rows (pending,
--   approved, processing, completed, rejected, failed),
--   one-active-per-seller partial unique, idempotency
--   unique, RLS seller-own/admin-read, zero client writes,
--   transition + identity guard trigger (binds service_role).
-- - Ledger vocabulary extended (reservation,
--   reservation_release + payout sources); append-only and
--   no-client-write rules unchanged.
-- - request/approve/reject/start/complete/fail RPCs: auth +
--   role gates + row locks + advisory serialization + amount
--   validation (min 500, 2dp) + capacity checks + idempotent
--   replays + compensating legs + audit rows; amounts always
--   from locked DB rows.
-- - Read RPCs: seller keyset history + admin keyset history
--   with validated status filter; minimal safe columns.
-- - 018 summaries superseded (same signatures + appended
--   reserved_amount where seller-scoped): available now nets
--   active reservations; pending/total/commission unchanged.
-- - 001-018 files untouched (new names + supersedes only);
--   EXECUTE to authenticated with in-function gates.
-- -----------------------------------------------------
