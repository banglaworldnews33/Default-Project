-- -----------------------------------------------------
-- Phase 26: refund / reversal / financial correction system
-- (compensating legs only; no history mutation, no gateway work)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Earnings exist (023) and move through withdrawals (019),
-- but nothing can reverse money: a refunded sale keeps paying
-- the seller forever, and accounting mistakes have no
-- controlled correction path. This migration adds immutable
-- compensating-event machinery WITHOUT touching gateways
-- (no APIs, keys, webhooks, HTTP) and WITHOUT mutating any
-- historical row:
--
-- - refund_requests (pending -> approved/rejected/processed)
-- - refund legs (single 'refund' row per processed request,
--   seller effect + reversed snapshots, linked to earning)
-- - financial corrections ('adjustment' legs, super-admin)
-- - paid -> refunded payment flip (all-earnings-refunded only)
-- - refund-aware financial read RPCs (explicit new columns)
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No bKash/Nagad refund APIs, webhooks, or provider work.
-- - No UPDATE/DELETE of ledger_entries, earnings, orders,
--   or order_items anywhere (append-only stands).
-- - No stored seller balances anywhere.
-- - No change to 001-019 files; 016 payment guard and 018
--   read RPCs are superseded here via CREATE OR REPLACE
--   (011 pattern: files untouched, behavior extended).
-- - No commission rule or payment verification changes.
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- MONEY RULE: numeric(12,2) everywhere; every amount derives
-- server-side from locked rows. Partial-refund shares use
-- exact decimal math with half-up cents:
--   commission_share = floor(C * R / N * 100 + 0.5) / 100
--   gross_share     = R + commission_share
-- (R = refunded net, C/N = original commission/net, N > 0
-- guaranteed because R <= remaining <= N and R > 0.)
-- Repeated partial refunds stay exact because the remaining
-- cap is always tracked in NET terms; per-event rounding can
-- at most shift a cent between successive partials, never
-- create money (each leg is independently derived).
--
-- ACCOUNTING MODEL (single 'refund' leg per processed request):
-- - amount            = -R  (seller balance effect; the ONLY
--                           signed money column that moves)
-- - gross_amount      = G'  (reversed gross share, >= 0)
-- - commission_amount = C'  (reversed commission share, >= 0)
-- - net_amount        = NULL (signed effect lives in amount;
--                           the 017 net CHECK passes via its
--                           null branch)
-- - commission_rule_id/rate = copied earning snapshot (never
--                           today's rule)
-- - reverses_entry_id -> original earning (traceability)
-- - discount_amount   = 0
-- Full refund: R = N, so G' = G and C' = C exactly.
-- Reporting: SUM(commission_amount) WHERE type='refund' is
-- total reversed commission; SUM(gross_amount) is reversed
-- gross; both fully queryable, nothing hidden in metadata.
--
-- Apply AFTER 001-019, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: ledger source vocabulary extension
-- ============================================================
-- Entry types need NO change: 'refund' and 'adjustment'
-- already exist in ledger_entry_type_check (019). Only the
-- source list grows, replacing the explicit constraint name
-- (019 pattern) so future phases keep explicit identifiers.

alter table public.ledger_entries
  drop constraint if exists ledger_source_check;

alter table public.ledger_entries
  add constraint ledger_source_check
  check (source in (
    'earning_recognition', 'withdrawal_reservation',
    'reservation_release', 'payout_completion',
    'refund_processing', 'admin_adjustment'
  ));

-- ============================================================
-- STEP 2: earning linkage for compensating legs
-- ============================================================
-- Lets every refund/adjustment point at the exact ledger row
-- it compensates (no FK to volatile tables; ledger rows are
-- never deleted so the reference cannot dangle).

alter table public.ledger_entries
  add column if not exists reverses_entry_id uuid
    references public.ledger_entries (id) on delete restrict;

create index if not exists idx_ledger_reverses
  on public.ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;

-- ============================================================
-- STEP 3: refund_requests (state-machine request rows)
-- ============================================================
-- One row per item refund case. Money never lives here:
-- amounts reverse via ledger legs at process time; this table
-- is workflow state + references only. requested_net_amount
-- is denominated in seller NET (the only coherent unit: the
-- seller returns what they were paid).

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  earning_entry_id uuid not null references public.ledger_entries (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  requested_net_amount numeric(12, 2) not null check (requested_net_amount > 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'processed'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 100),
  reason text check (reason is null or char_length(reason) between 1 and 2000),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 2000),
  requested_by uuid,
  approved_by uuid,
  processed_by uuid,
  approved_at timestamp with time zone,
  processed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (order_item_id, idempotency_key)
);

create index if not exists idx_refunds_seller on public.refund_requests (seller_id);
create index if not exists idx_refunds_status_created
  on public.refund_requests (status, created_at desc);
create index if not exists idx_refunds_item on public.refund_requests (order_item_id);

drop trigger if exists handle_refunds_updated_at on public.refund_requests;

create trigger handle_refunds_updated_at
  before update on public.refund_requests
  for each row execute function public.handle_updated_at();

-- ============================================================
-- STEP 4: RLS (default deny; least privilege per role)
-- ============================================================
-- Sellers read own requests only (status visibility for
-- their own items). Admins read all (existing is_admin()
-- model). No INSERT/UPDATE/DELETE policies for any client
-- role: every write runs inside the RPCs below.

alter table public.refund_requests enable row level security;

drop policy if exists "Sellers can view own refunds" on public.refund_requests;

create policy "Sellers can view own refunds"
  on public.refund_requests for select
  using (seller_id = auth.uid());

drop policy if exists "Admins can view all refunds" on public.refund_requests;

create policy "Admins can view all refunds"
  on public.refund_requests for select
  using (public.is_admin());

-- NOTE: intentionally NO insert/update/delete policies for
-- any client role.

revoke all on public.refund_requests from public, anon;
grant select on public.refund_requests to authenticated;

-- ============================================================
-- STEP 5: refund transition guard (binds every writer,
-- including service_role, which bypasses RLS but not triggers)
-- ============================================================
-- Only the legal state machine may pass, terminal states have
-- no exits, and workflow identity columns are frozen. Reason
-- text may only appear on the transitions that own it
-- (request reason at creation; rejection reason exactly on
-- pending -> rejected).

create or replace function public.guard_refund_transition()
returns trigger language plpgsql set search_path = public as
$$
begin
  if TG_OP = 'DELETE' then
    raise exception 'refund_requests: refund records are never deleted';
  end if;
  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.order_item_id is distinct from old.order_item_id
     or new.earning_entry_id is distinct from old.earning_entry_id
     or new.seller_id is distinct from old.seller_id
     or new.requested_net_amount is distinct from old.requested_net_amount
     or new.currency is distinct from old.currency
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'refund_requests: request identity and amount are immutable';
  end if;
  if (old.status = 'pending' and new.status in ('approved', 'rejected'))
     or (old.status = 'approved' and new.status = 'processed') then
    if new.rejection_reason is distinct from old.rejection_reason
       and not (old.status = 'pending' and new.status = 'rejected') then
      raise exception 'refund_requests: rejection reason is only writable on rejection';
    end if;
    return new;
  end if;
  raise exception 'refund_requests: illegal status transition';
  return null;
end;
$$;

drop trigger if exists guard_refund_transition on public.refund_requests;

create trigger guard_refund_transition
  before update or delete on public.refund_requests
  for each row execute function public.guard_refund_transition();

-- ============================================================
-- STEP 6: audit linkage for refund references
-- ============================================================
-- Additive nullable column (013/019 precedent): lets refund
-- audit rows point at the exact request. Order linkage rides
-- the existing order_id column; item specificity comes from
-- the request row itself.

alter table public.admin_audit_log
  add column if not exists refund_request_id uuid;

create index if not exists idx_admin_audit_refund on public.admin_audit_log (refund_request_id)
  where refund_request_id is not null;

-- ============================================================
-- STEP 7: extend payment guard (paid -> refunded, conditional)
-- ============================================================
-- 016 explicitly deferred this transition to the refund phase
-- ("which will extend this trigger"). The trigger below is
-- the ONLY new allowance: paid -> refunded, performed solely
-- by process_refund() after proving every earning on the
-- order is fully refunded. Partial refunds never move payment
-- status. All other transitions remain rejected; no-op
-- updates still pass so existing flows are unaffected.

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
  if old.payment_status = 'paid'
     and new.payment_status = 'refunded' then
    return new;
  end if;
  raise exception 'orders: illegal payment status transition';
  return null;
end;
$$;

-- ============================================================
-- STEP 8: request_refund() — admin-only case creation
-- ============================================================
-- Item-level, net-denominated, fully server-derived: seller,
-- order, earning, currency, and remaining cap all come from
-- locked rows. Per-item advisory lock serializes concurrent
-- cases; (order_item_id, idempotency_key) makes retries
-- return the original row.

create or replace function public.request_refund(
  p_order_item_id uuid,
  p_net_amount numeric,
  p_reason text,
  p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_earning public.ledger_entries%rowtype;
  v_earning_count integer;
  v_refunded numeric(12, 2);
  v_amount numeric(12, 2);
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- (1) Authenticated admin only. Sellers cannot create
  -- refunds; customers have no path at all.
  if v_admin_id is null then
    raise exception 'refund: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'refund: administrator access required';
  end if;

  -- (2) Amount/reason/key shape. Net-denominated, positive,
  -- 2dp max. NaN/infinity cannot arrive as JSON numbers.
  if p_net_amount is null or p_net_amount <= 0 then
    raise exception 'refund: refund amount must be greater than zero';
  end if;
  if trunc(p_net_amount, 2) <> p_net_amount then
    raise exception 'refund: refund amount must have at most 2 decimal places';
  end if;
  v_amount := p_net_amount::numeric(12, 2);
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 2000 then
    raise exception 'refund: reason is required';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 1
     or char_length(p_idempotency_key) > 100 then
    raise exception 'refund: idempotency key must be 1-100 characters';
  end if;

  -- (3) Serialize cases for this item within the transaction.
  perform pg_advisory_xact_lock(hashtext('refund:' || p_order_item_id::text));

  -- (4) Lock the authoritative item row.
  select * into v_item
  from public.order_items
  where id = p_order_item_id
  for update;
  if not found then
    raise exception 'refund: order item not found';
  end if;

  -- (5) Exactly one earning must exist for the item. Zero
  -- means nothing was ever earned (fail closed); more than
  -- one means a ledger invariant broke (fail closed).
  select count(*) into v_earning_count
  from public.ledger_entries
  where order_item_id = p_order_item_id
    and entry_type = 'earning';
  if v_earning_count = 0 then
    raise exception 'refund: no earning exists for this item';
  end if;
  if v_earning_count > 1 then
    raise exception 'refund: multiple earnings exist for this item';
  end if;
  select * into v_earning
  from public.ledger_entries
  where order_item_id = p_order_item_id
    and entry_type = 'earning'
  for update;
  if v_earning.net_amount is null then
    raise exception 'refund: original earning is malformed';
  end if;

  -- (6) Order must be paid (failed/pending orders hold no
  -- earnings by construction; this re-check is explicit).
  select * into v_order
  from public.orders
  where id = v_item.order_id;
  if not found then
    raise exception 'refund: parent order not found';
  end if;
  if v_order.payment_status is distinct from 'paid' then
    raise exception 'refund: order payment is not confirmed';
  end if;

  -- (7) Remaining cap in NET terms: original net minus all
  -- prior refund legs against this earning. Cumulative
  -- refunds can never exceed what the seller was paid.
  select coalesce(-sum(l.amount), 0) into v_refunded
  from public.ledger_entries l
  where l.reverses_entry_id = v_earning.id
    and l.entry_type = 'refund';
  if v_amount > v_earning.net_amount - v_refunded then
    raise exception 'refund: amount exceeds remaining refundable earning';
  end if;

  -- (8) Replay-first idempotency: same item + key returns the
  -- original request with no new rows and no state change.
  select id into v_existing_id
  from public.refund_requests
  where order_item_id = p_order_item_id
    and idempotency_key = p_idempotency_key;
  if found then
    return v_existing_id;
  end if;

  -- (9) Persist the pending case. All references derive from
  -- locked rows above — never from caller-supplied identity.
  v_new_id := gen_random_uuid();
  begin
    insert into public.refund_requests (
      id, order_id, order_item_id, earning_entry_id, seller_id,
      requested_net_amount, currency, status, idempotency_key, reason,
      requested_by
    )
    values (
      v_new_id, v_item.order_id, v_item.id, v_earning.id, v_item.seller_id,
      v_amount, v_earning.currency, 'pending', p_idempotency_key, p_reason,
      v_admin_id
    );
  exception when unique_violation then
    -- Lost a race: return the conflicting original rather
    -- than duplicating the case.
    select id into v_existing_id
    from public.refund_requests
    where order_item_id = p_order_item_id
      and idempotency_key = p_idempotency_key;
    if found then
      return v_existing_id;
    end if;
    raise;
  end;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id, refund_request_id)
  values
    ('refund.requested', v_admin_id, null, null, null, null, v_item.order_id, null, v_new_id);

  return v_new_id;
end;
$$;

revoke all on function public.request_refund(uuid, numeric, text, text) from public, anon, service_role;
grant execute on function public.request_refund(uuid, numeric, text, text) to authenticated;

-- ============================================================
-- STEP 9: approve_refund() — pending -> approved
-- ============================================================
-- Re-validates the remaining cap: another refund may have
-- processed since request creation. Retries on an approved
-- row return it silently (no duplicate audit).

create or replace function public.approve_refund(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.refund_requests%rowtype;
  v_earning public.ledger_entries%rowtype;
  v_refunded numeric(12, 2);
begin
  if v_admin_id is null then
    raise exception 'refund: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'refund: administrator access required';
  end if;

  select * into v_req
  from public.refund_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'refund: request not found';
  end if;
  if v_req.status = 'approved' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'refund: only pending requests can be approved';
  end if;

  -- Capacity re-check against live ledger state.
  select * into v_earning
  from public.ledger_entries
  where id = v_req.earning_entry_id
  for update;
  if not found then
    raise exception 'refund: original earning not found';
  end if;
  if v_earning.net_amount is null then
    raise exception 'refund: original earning is malformed';
  end if;
  select coalesce(-sum(l.amount), 0) into v_refunded
  from public.ledger_entries l
  where l.reverses_entry_id = v_earning.id
    and l.entry_type = 'refund';
  if v_req.requested_net_amount > v_earning.net_amount - v_refunded then
    raise exception 'refund: amount exceeds remaining refundable earning';
  end if;

  update public.refund_requests
  set status = 'approved',
      approved_by = v_admin_id,
      approved_at = timezone('utc'::text, now())
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id, refund_request_id)
  values
    ('refund.approved', v_admin_id, null, null, null, null, v_req.order_id, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.approve_refund(uuid) from public, anon, service_role;
grant execute on function public.approve_refund(uuid) to authenticated;

-- ============================================================
-- STEP 10: reject_refund() — pending -> rejected
-- ============================================================

create or replace function public.reject_refund(p_request_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.refund_requests%rowtype;
begin
  if v_admin_id is null then
    raise exception 'refund: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'refund: administrator access required';
  end if;
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 2000 then
    raise exception 'refund: rejection reason is required';
  end if;

  select * into v_req
  from public.refund_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'refund: request not found';
  end if;
  if v_req.status = 'rejected' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'pending' then
    raise exception 'refund: only pending requests can be rejected';
  end if;

  update public.refund_requests
  set status = 'rejected',
      rejection_reason = p_reason
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id, refund_request_id)
  values
    ('refund.rejected', v_admin_id, null, null, null, null, v_req.order_id, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.reject_refund(uuid, text) from public, anon, service_role;
grant execute on function public.reject_refund(uuid, text) to authenticated;

-- ============================================================
-- STEP 11: process_refund() — approved -> processed (+ leg)
-- ============================================================
-- The money moment. Exactly ONE 'refund' leg per processed
-- request (unique reference_key converges races): seller
-- effect -R with reversed gross/commission snapshots copied
-- from the ORIGINAL earning (never today's rule). Then the
-- conditional payment flip: paid -> refunded only when every
-- earning on the order is fully refunded AND every item is
-- terminal (delivered/cancelled). Partial refunds never move
-- payment status.

create or replace function public.process_refund(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_req public.refund_requests%rowtype;
  v_earning public.ledger_entries%rowtype;
  v_order public.orders%rowtype;
  v_refunded numeric(12, 2);
  v_r numeric(12, 2);
  v_c_share numeric(12, 2);
  v_g_share numeric(12, 2);
  v_flip boolean;
begin
  if v_admin_id is null then
    raise exception 'refund: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'refund: administrator access required';
  end if;

  select * into v_req
  from public.refund_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'refund: request not found';
  end if;
  if v_req.status = 'processed' then
    return v_req.id;
  end if;
  if v_req.status is distinct from 'approved' then
    raise exception 'refund: only approved requests can be processed';
  end if;

  -- Lock earning + order; re-validate capacity (a sibling
  -- refund may have processed since approval).
  select * into v_earning
  from public.ledger_entries
  where id = v_req.earning_entry_id
  for update;
  if not found then
    raise exception 'refund: original earning not found';
  end if;
  if v_earning.net_amount is null then
    raise exception 'refund: original earning is malformed';
  end if;
  select * into v_order
  from public.orders
  where id = v_req.order_id
  for update;
  if not found then
    raise exception 'refund: parent order not found';
  end if;
  if v_order.payment_status is distinct from 'paid' then
    raise exception 'refund: order payment is not confirmed';
  end if;
  select coalesce(-sum(l.amount), 0) into v_refunded
  from public.ledger_entries l
  where l.reverses_entry_id = v_earning.id
    and l.entry_type = 'refund';
  v_r := v_req.requested_net_amount;
  if v_r > v_earning.net_amount - v_refunded then
    raise exception 'refund: amount exceeds remaining refundable earning';
  end if;

  -- Proportional reversed shares from the ORIGINAL snapshot.
  -- N > 0 holds: R <= remaining <= N with R > 0.
  v_c_share := (
    floor(v_earning.commission_amount * v_r / v_earning.net_amount * 100 + 0.5) / 100
  )::numeric(12, 2);
  v_g_share := (v_r + v_c_share)::numeric(12, 2);

  -- Single immutable leg. Races converge on the unique key
  -- into the same idempotent outcome below.
  begin
    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata, reverses_entry_id
    )
    values (
      v_earning.seller_id, v_earning.order_id, v_earning.order_item_id, 'refund',
      -v_r, v_earning.currency, v_earning.commission_rule_id, v_earning.commission_rate,
      v_g_share, v_c_share, 0, null,
      'refund:' || v_req.id::text, 'refund_processing', null, v_earning.id
    );
  exception when unique_violation then
    -- A prior attempt already wrote the leg: fall through to
    -- the state advance below (still guarded by the row lock).
    null;
  end;

  -- Conditional payment flip: every earning fully refunded
  -- AND every item terminal AND at least one earning exists.
  -- Otherwise payment_status is left untouched.
  select
    exists (
      select 1 from public.ledger_entries e
      where e.order_id = v_order.id and e.entry_type = 'earning'
    )
    and not exists (
      select 1 from public.ledger_entries e
      where e.order_id = v_order.id and e.entry_type = 'earning'
        and (e.net_amount is null
             or e.net_amount - coalesce((
               select -sum(a.amount) from public.ledger_entries a
               where a.reverses_entry_id = e.id and a.entry_type = 'refund'
             ), 0) > 0)
    )
    and not exists (
      select 1 from public.order_items i
      where i.order_id = v_order.id
        and i.fulfillment_status not in ('delivered', 'cancelled')
    )
  into v_flip;
  if v_flip then
    update public.orders
    set payment_status = 'refunded'
    where id = v_order.id;
  end if;

  update public.refund_requests
  set status = 'processed',
      processed_by = v_admin_id,
      processed_at = timezone('utc'::text, now())
  where id = v_req.id;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id, refund_request_id)
  values
    ('refund.processed', v_admin_id, null, null, null, null, v_req.order_id, null, v_req.id);

  return v_req.id;
end;
$$;

revoke all on function public.process_refund(uuid) from public, anon, service_role;
grant execute on function public.process_refund(uuid) to authenticated;

-- ============================================================
-- STEP 12: create_adjustment() — super-admin corrections
-- ============================================================
-- Rare accounting corrections as NEW signed legs. The seller,
-- order/item refs, and currency copy from the referenced
-- original row (never the caller); only amount, reason, and
-- key are inputs. Super-admin-only: normal admins are denied
-- here even though they may process refunds. Idempotency key
-- returns the original leg on retry.

create or replace function public.create_adjustment(
  p_ledger_entry_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_admin_id uuid := auth.uid();
  v_orig public.ledger_entries%rowtype;
  v_amount numeric(12, 2);
  v_ref text;
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- (1) Authenticated super admin only. Normal admins use
  -- refunds; corrections stay at the highest privilege.
  if v_admin_id is null then
    raise exception 'adjustment: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'adjustment: super-administrator access required';
  end if;

  -- (2) Signed non-zero amount, 2dp max; reason + key shape.
  if p_amount is null or p_amount = 0 then
    raise exception 'adjustment: amount must be non-zero';
  end if;
  if trunc(p_amount, 2) <> p_amount then
    raise exception 'adjustment: amount must have at most 2 decimal places';
  end if;
  v_amount := p_amount::numeric(12, 2);
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 2000 then
    raise exception 'adjustment: reason is required';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 1
     or char_length(p_idempotency_key) > 100 then
    raise exception 'adjustment: idempotency key must be 1-100 characters';
  end if;
  v_ref := 'adjustment:' || p_idempotency_key;

  -- (3) Lock the referenced original. Any ledger row qualifies
  -- as an anchor; its seller/currency/refs are copied verbatim.
  select * into v_orig
  from public.ledger_entries
  where id = p_ledger_entry_id
  for update;
  if not found then
    raise exception 'adjustment: original ledger entry not found';
  end if;

  -- (4) Replay-first idempotency: same key returns the
  -- original leg with no new rows and no state change.
  select id into v_existing_id
  from public.ledger_entries
  where reference_key = v_ref;
  if found then
    return v_existing_id;
  end if;

  -- (5) Append the compensating leg. Nothing is edited.
  begin
    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata, reverses_entry_id
    )
    values (
      v_orig.seller_id, v_orig.order_id, v_orig.order_item_id, 'adjustment',
      v_amount, v_orig.currency, null, null,
      null, null, 0, null,
      v_ref, 'admin_adjustment', null, v_orig.id
    )
    returning id into v_new_id;
  exception when unique_violation then
    select id into v_existing_id
    from public.ledger_entries
    where reference_key = v_ref;
    if found then
      return v_existing_id;
    end if;
    raise;
  end;

  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id, withdrawal_id, refund_request_id)
  values
    ('financial.adjustment', v_admin_id, null, null, null, null, v_orig.order_id, null, null);

  return v_new_id;
end;
$$;

revoke all on function public.create_adjustment(uuid, numeric, text, text) from public, anon, service_role;
grant execute on function public.create_adjustment(uuid, numeric, text, text) to authenticated;

-- ============================================================
-- STEP 13: refund read RPCs (admin review queue)
-- ============================================================
-- Verified-admin review surface: keyset pagination
-- (created_at DESC, id DESC) plus an optional validated
-- status filter. Shop names are already public marketplace
-- data; no customer PII, no secrets — references, amounts,
-- statuses, and safe reason text only.

create or replace function public.get_admin_refunds(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null,
  p_status text default null
)
returns table (
  refund_id uuid,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  seller_id uuid,
  shop_name text,
  requested_net_amount numeric,
  currency text,
  status text,
  reason text,
  rejection_reason text,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  processed_at timestamp with time zone,
  rejected_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.order_id, o.order_number, r.order_item_id,
         r.seller_id, s.shop_name, r.requested_net_amount, r.currency,
         r.status, r.reason, r.rejection_reason, r.created_at,
         r.approved_at, r.processed_at, r.rejected_at
  from public.refund_requests r
  left join public.orders o on o.id = r.order_id
  left join public.seller_shops s on s.seller_id = r.seller_id
  where public.is_admin()
    and (p_status is null
         or (p_status in ('pending', 'approved', 'rejected', 'processed')
             and r.status = p_status))
    and (p_created_before is null
         or p_id_before is null
         or (r.created_at, r.id) < (p_created_before, p_id_before))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_admin_refunds(integer, timestamp with time zone, uuid, text) from public, anon, service_role;
grant execute on function public.get_admin_refunds(integer, timestamp with time zone, uuid, text) to authenticated;

-- ============================================================
-- STEP 14: refund-aware financial read RPCs (018/019 superseded)
-- ============================================================
-- Same signatures plus appended explicit columns, so existing
-- readers keep working. Semantics are now explicit instead of
-- overloaded:
-- - total_earnings / total_commission: gross recognized
--   history (unchanged — traceability preserved).
-- - refunded_amount: returned seller money, >= 0
--   (-SUM of 'refund' legs).
-- - adjustment_amount: signed correction total (may be
--   positive or negative).
-- - net_earnings: total + refund legs + adjustment legs
--   (historical earnings net of refunds and adjustments,
--   excluding reservation, reservation_release, and payout
--   settlement legs). This is NOT the seller's complete cash
--   position: available_balance remains the authoritative
--   withdrawable/cash-position figure.
-- - refunded_commission: reversed commission snapshots.
-- - available_balance: UNCHANGED formula (cleared earnings
--   plus every non-earning leg). Refund and adjustment legs
--   are non-earning, so they already reduce availability
--   immediately — no formula change was needed and none was
--   made. This is verified, not assumed: the predicate is
--   entry_type <> 'earning', which covers the new legs.
-- - pending_earnings: unchanged (clearing earnings only).
-- Zero rows still means no data or no authorization — never
-- a fabricated zero.

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
  reserved_amount numeric,
  refunded_amount numeric,
  adjustment_amount numeric,
  net_earnings numeric,
  refunded_commission numeric
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
         ), 0),
         coalesce(-sum(l.amount) filter (where l.entry_type = 'refund'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'adjustment'), 0),
         coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type in ('refund', 'adjustment')), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'refund'), 0)
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
  group by l.currency;
$$;

revoke all on function public.get_seller_financial_summary() from public, anon, service_role;
grant execute on function public.get_seller_financial_summary() to authenticated;

drop function if exists public.get_seller_ledger(integer, timestamp with time zone, uuid);

create or replace function public.get_seller_ledger(
  p_limit integer default 25,
  p_created_before timestamp with time zone default null,
  p_id_before uuid default null
)
returns table (
  entry_id uuid,
  entry_type text,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  gross_amount numeric,
  commission_rate numeric,
  commission_amount numeric,
  net_amount numeric,
  currency text,
  clearing_status text,
  created_at timestamp with time zone,
  source text,
  reverses_entry_id uuid,
  amount numeric
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select l.id, l.entry_type, l.order_id, o.order_number, l.order_item_id,
         l.gross_amount, l.commission_rate, l.commission_amount, l.net_amount,
         l.currency,
         case when l.created_at > now() - interval '7 days'
              then 'pending' else 'available' end,
         l.created_at, l.source, l.reverses_entry_id, l.amount
  from public.ledger_entries l
  join public.profiles p on p.id = auth.uid()
  left join public.orders o on o.id = l.order_id
  where l.seller_id = auth.uid()
    and p.role = 'seller'
    and p.verification_status = 'verified'
    and (p_created_before is null
         or p_id_before is null
         or (l.created_at, l.id) < (p_created_before, p_id_before))
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_seller_ledger(integer, timestamp with time zone, uuid) from public, anon, service_role;
grant execute on function public.get_seller_ledger(integer, timestamp with time zone, uuid) to authenticated;

drop function if exists public.get_admin_financial_summary();

create or replace function public.get_admin_financial_summary()
returns table (
  total_earnings numeric,
  total_commission numeric,
  pending_earnings numeric,
  available_earnings numeric,
  earning_count bigint,
  sellers_with_earnings bigint,
  currency text,
  refunded_amount numeric,
  adjustment_amount numeric,
  net_earnings numeric,
  refunded_commission numeric
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
         l.currency,
         coalesce(-sum(l.amount) filter (where l.entry_type = 'refund'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'adjustment'), 0),
         coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type in ('refund', 'adjustment')), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'refund'), 0)
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
  reserved_amount numeric,
  refunded_amount numeric,
  adjustment_amount numeric,
  net_earnings numeric,
  refunded_commission numeric
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
         ), 0),
         coalesce(-sum(l.amount) filter (where l.entry_type = 'refund'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'adjustment'), 0),
         coalesce(sum(l.net_amount) filter (where l.entry_type = 'earning'), 0)
         + coalesce(sum(l.amount) filter (
           where l.entry_type in ('refund', 'adjustment')), 0),
         coalesce(sum(l.commission_amount) filter (where l.entry_type = 'refund'), 0)
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
-- - refund_requests: item-level net-denominated cases
--   (pending/approved/rejected/processed), seller+item+key
--   identity, RLS seller-own/admin-read, zero client writes,
--   transition + identity guard trigger (binds service_role).
-- - request/approve/reject/process RPCs: admin gates, item +
--   earning locks, paid-order gate, remaining-cap checks at
--   three points, single 'refund' compensating leg with
--   original snapshots, conditional paid -> refunded flip,
--   idempotent replays, audit rows; amounts never trusted.
-- - create_adjustment(): super-admin signed compensating legs
--   anchored to any ledger row, idempotent by key.
-- - 022 payment guard extended (paid -> refunded added; all
--   else preserved). 018/019 reads superseded with appended
--   explicit refund columns; available formula verified
--   unchanged-correct.
-- - 001-019 files untouched (new names + supersedes only);
--   EXECUTE to authenticated with in-function gates.
-- -----------------------------------------------------
