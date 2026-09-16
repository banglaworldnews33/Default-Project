-- -----------------------------------------------------
-- Phase 22: payment verification foundation (read-mostly;
--           verification writes are RPC-only, idempotent,
--           COD-linked, audited)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Real marketplace orders (012) carry payment_method and
-- payment_status, but nothing ever verifies payment: every
-- real order sits at payment_status = 'pending' forever, and
-- no verification record, idempotency, state machine, or
-- COD/delivery linkage exists. This migration adds the
-- minimum secure foundation WITHOUT touching money movement
-- (no ledger, commission, balances, withdrawals, payouts,
-- refunds — all future phases):
--
-- - payment_verifications table (immutable attempt records)
-- - verify_payment() RPC (admin-only, idempotent)
-- - COD auto-confirmation on full delivery (server trigger)
-- - payment_status transition guard (pending -> paid/failed)
-- - append-only enforcement (even service_role cannot mutate)
-- - admin RLS read visibility + audit linkage
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No commission rules, ledger, balances, withdrawals,
--   payouts, refunds, refund RPCs, or financial reporting.
-- - No payment gateway integration: no API keys, secrets,
--   webhooks, callbacks, HTTP calls, or provider SDKs.
-- - No paid -> refunded transition (future refund phase owns
--   it; the guard trigger below rejects it for now).
-- - No change to 001-015 objects except one ADDITIVE trigger
--   on orders (COD linkage) plus one guard trigger on
--   orders.payment_status. No existing table, column, policy,
--   trigger, RPC, or grant is altered or removed.
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- Apply AFTER 001-015, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: payment_verifications (immutable attempt records)
-- ============================================================
-- One row per verification ATTEMPT, never mutated afterwards.
-- verified_amount/currency always come from the authoritative
-- orders row (never the client). verified_by is the acting
-- admin, or NULL for the automatic COD-delivery path (the
-- seller did not verify payment; the system recorded the
-- delivery consequence). metadata stays NULL in this phase:
-- no client-supplied JSON is accepted anywhere below.

create table if not exists public.payment_verifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_method text not null check (payment_method in ('cod', 'bkash', 'nagad')),
  provider_reference text check (provider_reference is null or char_length(provider_reference) between 1 and 200),
  attempt_key text not null check (char_length(attempt_key) between 1 and 100),
  status text not null check (status in ('paid', 'failed')),
  verified_amount numeric(12, 2) not null check (verified_amount >= 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  verified_at timestamp with time zone not null default timezone('utc'::text, now()),
  verified_by uuid,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 2000),
  source text not null check (source in ('admin_verification', 'cod_delivery')),
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (status = 'paid' or failure_reason is not null),
  unique (order_id, attempt_key)
);

create index if not exists idx_payment_verifications_order on public.payment_verifications (order_id);
create index if not exists idx_payment_verifications_status on public.payment_verifications (status);
create index if not exists idx_payment_verifications_provider on public.payment_verifications (provider_reference)
  where provider_reference is not null;

-- ============================================================
-- STEP 2: RLS (default deny; admin read-only; no client writes)
-- ============================================================
-- Verification rows carry payment metadata and are not a
-- general data source: no customer/seller policies at all.
-- Writes happen ONLY inside the SECURITY DEFINER RPC / COD
-- trigger below (definer context bypasses RLS by design);
-- clients hold zero INSERT/UPDATE/DELETE reachability.

alter table public.payment_verifications enable row level security;

drop policy if exists "Admins can view all payment verifications" on public.payment_verifications;

create policy "Admins can view all payment verifications"
  on public.payment_verifications for select
  using (public.is_admin());

-- NOTE: intentionally NO insert/update/delete policies for any
-- client role. Creation happens ONLY inside verify_payment()
-- and the COD linkage trigger below.

revoke all on public.payment_verifications from public, anon;
grant select on public.payment_verifications to authenticated;

-- ============================================================
-- STEP 3: append-only enforcement (binds every writer,
-- including service_role, which bypasses RLS but not triggers)
-- ============================================================

create or replace function public.guard_payment_verification_immutable()
returns trigger language plpgsql set search_path = public as
$$
begin
  raise exception 'payment_verifications: verification records are append-only';
  return null;
end;
$$;

drop trigger if exists guard_payment_verification_immutable on public.payment_verifications;

create trigger guard_payment_verification_immutable
  before update or delete on public.payment_verifications
  for each row execute function public.guard_payment_verification_immutable();

-- ============================================================
-- STEP 4: payment_status transition guard on orders
-- ============================================================
-- Phase 22 owns exactly: pending -> paid, pending -> failed.
-- paid -> refunded belongs to the future refund phase (which
-- will extend this trigger); everything else is rejected.
-- Updates that leave payment_status unchanged always pass, so
-- the existing fulfillment/order flows are unaffected.

create or replace function public.guard_payment_status_transition()
returns trigger language plpgsql set search_path = public as
$$
begin
  if new.payment_status is not distinct from old.payment_status then
    return new;
  end if;
  if old.payment_status = 'pending'
     and new.payment_status in ('paid', 'failed') then
    return new;
  end if;
  raise exception 'orders: illegal payment status transition';
  return null;
end;
$$;

drop trigger if exists guard_payment_status_transition on public.orders;

create trigger guard_payment_status_transition
  before update of payment_status on public.orders
  for each row execute function public.guard_payment_status_transition();

-- ============================================================
-- STEP 5: verify_payment() — the ONLY manual verification path
-- ============================================================
-- Narrowly scoped SECURITY DEFINER RPC. The caller proves
-- nothing except a valid admin session: order existence,
-- current status, payment method, total, and currency are all
-- loaded from the locked orders row. Client-supplied money,
-- method, status, or identity values have nowhere to go (no
-- such assignments exist below).
--
-- Idempotency contract: (order_id, attempt_key) is unique. A
-- replayed attempt returns the ORIGINAL outcome with no state
-- change and no duplicate audit row. Concurrent duplicates
-- serialize on the order lock; the unique backstop converts
-- any residual race into the same replay path.

create or replace function public.verify_payment(
  p_order_id uuid,
  p_decision text,
  p_attempt_key text,
  p_provider_reference text default null,
  p_failure_reason text default null
)
returns text language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.payment_verifications%rowtype;
  v_action text;
begin
  -- (1) Authenticated admin only. service_role/API keys without
  -- a user JWT have NULL auth.uid() and are rejected here too.
  if v_admin_id is null then
    raise exception 'payment: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'payment: administrator access required';
  end if;

  -- (2) Decision + attempt shape (fail fast, before locking).
  if p_decision is null or p_decision not in ('paid', 'failed') then
    raise exception 'payment: decision must be paid or failed';
  end if;
  if p_attempt_key is null or char_length(p_attempt_key) < 1 or char_length(p_attempt_key) > 100 then
    raise exception 'payment: attempt key must be 1-100 characters';
  end if;
  if p_decision = 'failed'
     and (p_failure_reason is null or char_length(p_failure_reason) < 1) then
    raise exception 'payment: failure reason is required';
  end if;

  -- (3) Lock the authoritative order row. All money/method facts
  -- below come from this row, never from the caller.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'payment: order not found';
  end if;

  -- (4) Idempotent replay: the attempt already exists, so return
  -- its outcome with no writes and no audit row. First write
  -- wins, including across decision mismatches.
  select * into v_existing
  from public.payment_verifications
  where order_id = p_order_id
    and attempt_key = p_attempt_key;
  if found then
    return v_existing.status;
  end if;

  -- (5) Only pending orders can be verified (paid/failed orders
  -- reject new attempts; refunds are a future phase).
  if v_order.payment_status is distinct from 'pending' then
    raise exception 'payment: order is already %', v_order.payment_status;
  end if;

  -- (6) Method integrity, enforced server-side against the
  -- order's own payment_method (never a client value).
  if p_decision = 'paid' and v_order.payment_method in ('bkash', 'nagad') then
    if p_provider_reference is null or char_length(p_provider_reference) < 1
       or char_length(p_provider_reference) > 200 then
      raise exception 'payment: provider reference is required';
    end if;
  end if;
  if p_decision = 'paid' and v_order.payment_method = 'cod'
     and v_order.order_status is distinct from 'delivered' then
    raise exception 'payment: COD orders require full delivery before payment confirmation';
  end if;

  -- (7) Persist the immutable record, then advance payment state.
  -- verified_amount/currency are the order's own values. The
  -- state guard (STEP 4) independently permits pending -> paid
  -- and pending -> failed and nothing else.
  begin
    insert into public.payment_verifications (
      order_id, payment_method, provider_reference, attempt_key,
      status, verified_amount, currency, verified_by,
      failure_reason, source, metadata
    )
    values (
      v_order.id, v_order.payment_method,
      nullif(p_provider_reference, ''),
      p_attempt_key, p_decision, v_order.total, v_order.currency,
      v_admin_id,
      nullif(p_failure_reason, ''),
      'admin_verification', null
    );
  exception when unique_violation then
    -- Concurrent duplicate won the race: same replay path as (4).
    select * into v_existing
    from public.payment_verifications
    where order_id = p_order_id
      and attempt_key = p_attempt_key;
    if found then
      return v_existing.status;
    end if;
    raise;
  end;

  update public.orders
  set payment_status = p_decision
  where id = v_order.id;

  -- (8) Audit: actor + order link only. No customer PII, no
  -- payment secrets, no frontend-supplied identity. target stays
  -- NULL per the 013 philosophy (the order_id link suffices).
  if p_decision = 'paid' then
    v_action := 'payment.verified';
  else
    v_action := 'payment.failed';
  end if;
  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id)
  values
    (v_action, v_admin_id, null, null, null, null, v_order.id);

  return p_decision;
end;
$$;

revoke all on function public.verify_payment(uuid, text, text, text, text) from public, anon, service_role;
grant execute on function public.verify_payment(uuid, text, text, text, text) to authenticated;

-- ============================================================
-- STEP 6: COD auto-confirmation on full delivery
-- ============================================================
-- Extends the server-side fulfillment path (013) WITHOUT
-- touching its authorization model: this BEFORE trigger fires
-- inside the same transaction when the parent aggregate
-- reaches 'delivered'. One seller's item can never trigger it
-- (the aggregate requires every non-cancelled item delivered).
-- Sellers cannot mark anything paid: they hold no UPDATE path
-- to orders at all, and this trigger only ever moves
-- pending -> paid for cod orders.
--
-- The trigger function is SECURITY DEFINER (fixed search_path)
-- so the verification insert succeeds regardless of which
-- definer/invoker context the parent update runs in. The
-- attempt key 'cod_delivery' plus the unique backstop make
-- repeat deliveries converge to a single record.

create or replace function public.handle_cod_delivery_payment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  if new.payment_method is distinct from 'cod' then
    return new;
  end if;
  if new.payment_status is distinct from 'pending' then
    return new;
  end if;
  insert into public.payment_verifications (
    order_id, payment_method, provider_reference, attempt_key,
    status, verified_amount, currency, verified_by,
    failure_reason, source, metadata
  )
  values (
    new.id, 'cod', null, 'cod_delivery',
    'paid', new.total, new.currency,
    null, null, 'cod_delivery', null
  )
  on conflict (order_id, attempt_key) do nothing;
  -- Converge payment state with the recorded verification.
  new.payment_status := 'paid';
  return new;
end;
$$;

drop trigger if exists handle_cod_delivery_payment on public.orders;

create trigger handle_cod_delivery_payment
  before update of order_status on public.orders
  for each row
  when (new.order_status = 'delivered' and old.order_status is distinct from 'delivered')
  execute function public.handle_cod_delivery_payment();

-- ============================================================
-- SUMMARY
-- ============================================================
-- - payment_verifications: immutable attempt records, order FK
--   RESTRICT, method/status/currency CHECKs, failure-reason
--   rule, unique (order_id, attempt_key), minimal indexes.
-- - RLS default-deny with admin-only SELECT; zero client write
--   policies or grants; append-only trigger binds service_role.
-- - guard_payment_status_transition(): pending -> paid/failed
--   only; no-op updates pass; existing flows unaffected.
-- - verify_payment(): auth + is_admin + FOR UPDATE lock +
--   replay-first idempotency (+ unique_violation convergence)
--   + method/amount integrity from the order row + COD
--   delivery precondition + immutable record + guarded state
--   advance + linked audit; id-only-style minimal return.
-- - handle_cod_delivery_payment(): server-side COD confirm on
--   aggregate delivered (all non-cancelled items), single
--   'cod_delivery' record per order, no seller PII, no auth
--   model change to fulfillment.
-- - 001-015 objects untouched except two ADDITIVE orders
--   triggers; all new names; EXECUTE-to-authenticated only.
-- -----------------------------------------------------
