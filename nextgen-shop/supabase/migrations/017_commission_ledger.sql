-- -----------------------------------------------------
-- Phase 23: commission rules + immutable seller ledger
-- (earning recognition foundation; no balances, payouts,
-- refunds, or gateway work)
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Real marketplace orders (012), fulfillment (013), payment
-- verification (016) all exist, but no commission or earning
-- machinery exists: rates are unconfigured, earnings are
-- unrecognized, and no financial history is recorded. This
-- migration adds the minimum secure foundation WITHOUT
-- moving spendable money (no balances, withdrawals, payouts,
-- refunds — all future phases):
--
-- - commission_rules (versioned global + category rates)
-- - ledger_entries (append-only, item-level earnings with
--   commission snapshots)
-- - create_commission_rule() (super-admin-only versioning)
-- - get_commission_rules() / get_commission_rule_history()
--   (super-admin-only reads)
-- - recognize_earning() (admin-path, idempotent recognition
--   gated on Phase 22 paid + 013 delivered)
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No balances (stored or otherwise), withdrawals, payouts,
--   refunds, refund RPCs, payment gateway integration, or
--   financial reporting.
-- - No change to 001-016 objects (tables, policies, triggers,
--   RPCs, grants on existing objects are byte-for-byte
--   preserved; no new triggers on existing tables).
-- - No DELETE policies anywhere. No service_role frontend use.
-- - No demo migration: demo checkout/orders stay untouched.
--
-- MONEY RULE: numeric(12,2) everywhere. Item commission uses
-- half-up rounding to cents, computed as
-- floor(gross * rate + 0.5) / 100 (all inputs non-negative,
-- so floor(x + 0.5) is exact half-up). Net is derived, never
-- accepted: net = gross - commission - discount_share.
--
-- DISCOUNT NOTE (approved model: proportional from seller
-- gross; delivery absorbed by platform): real orders carry
-- discount = 0 (012 hardcodes it; no real coupons exist), so
-- Phase 23 records discount_amount = 0 and computes net over
-- full line_subtotal. The dormant discount_amount column plus
-- the net CHECK below keep the schema ready for the future
-- allocation phase without silently fabricating values now.
--
-- Apply AFTER 001-016, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: commission_rules (versioned global + category rates)
-- ============================================================
-- One scope = global (category_id NULL) or one category.
-- History is rows, never edits: a rate change closes the open
-- row (effective_to) and inserts a new open row. At most one
-- open row per scope (partial unique index). effective_from
-- may be past, present, or future (scheduled rates); overlap
-- is rejected inside the RPC, which also serializes writers
-- per scope with row locks.

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete restrict,
  rate numeric(5, 2) not null check (rate >= 0 and rate <= 100),
  effective_from timestamp with time zone not null,
  effective_to timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (effective_to is null or effective_to > effective_from)
);

-- At most one open-ended rule per scope. The zero UUID stands
-- in for the global (NULL category) scope because NULLs are
-- never equal under unique constraints.
create unique index if not exists idx_commission_rules_one_open
  on public.commission_rules ((coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where effective_to is null;

create index if not exists idx_commission_rules_scope
  on public.commission_rules (category_id, effective_from desc);

-- ============================================================
-- STEP 2: ledger_entries (append-only item-level earnings)
-- ============================================================
-- One row per delivered order item (entry_type 'earning';
-- amount = seller net). The type CHECK already admits the
-- future vocabulary (adjustment/refund/reversal/payout/...)
-- so later phases add rows, never constraint migrations.
-- reference_key carries idempotency ('earning:<item_id>').
-- discount_amount is dormant 0 until the allocation phase.

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  entry_type text not null check (entry_type in (
    'earning', 'commission', 'adjustment', 'refund',
    'reversal', 'payout', 'payout_reversal'
  )),
  amount numeric(12, 2) not null,
  currency text not null default 'BDT' check (currency = 'BDT'),
  commission_rule_id uuid references public.commission_rules (id) on delete restrict,
  commission_rate numeric(5, 2) check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100)),
  gross_amount numeric(12, 2) check (gross_amount is null or gross_amount >= 0),
  commission_amount numeric(12, 2) check (commission_amount is null or commission_amount >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(12, 2) check (net_amount is null or net_amount >= 0),
  reference_key text not null unique check (char_length(reference_key) between 1 and 200),
  source text not null check (source in ('earning_recognition')),
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (net_amount is null or net_amount = gross_amount - commission_amount - discount_amount)
);

create index if not exists idx_ledger_seller on public.ledger_entries (seller_id);
create index if not exists idx_ledger_order_item on public.ledger_entries (order_item_id);
create index if not exists idx_ledger_seller_created on public.ledger_entries (seller_id, created_at desc);

-- ============================================================
-- STEP 3: RLS (default deny; least privilege per role)
-- ============================================================
-- Commission config is super-admin eyes only (even normal
-- admins get zero rows). Sellers read own ledger rows only.
-- Customers read nothing financial. No INSERT/UPDATE/DELETE
-- policies exist for any client role on either table: all
-- writes run inside the SECURITY DEFINER RPCs below.

alter table public.commission_rules enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists "Super admins can view commission rules" on public.commission_rules;

create policy "Super admins can view commission rules"
  on public.commission_rules for select
  using (public.is_super_admin());

drop policy if exists "Sellers can view own ledger entries" on public.ledger_entries;

create policy "Sellers can view own ledger entries"
  on public.ledger_entries for select
  using (seller_id = auth.uid());

drop policy if exists "Super admins can view all ledger entries" on public.ledger_entries;

create policy "Super admins can view all ledger entries"
  on public.ledger_entries for select
  using (public.is_super_admin());

-- NOTE: intentionally NO insert/update/delete policies on
-- either table for any client role.

revoke all on public.commission_rules from public, anon;
revoke all on public.ledger_entries from public, anon;

grant select on public.commission_rules to authenticated;
grant select on public.ledger_entries to authenticated;

-- ============================================================
-- STEP 4: immutability enforcement (binds every writer,
-- including service_role, which bypasses RLS but not triggers)
-- ============================================================
-- Ledger rows: NOTHING ever updates them (append-only, full
-- stop). Commission rows: exactly one narrow close operation
-- (NULL -> timestamp on effective_to, all else identical) and
-- ONLY inside a transaction where create_commission_rule() has
-- armed the local flag (011 pattern). DELETE is always
-- rejected on both tables.

create or replace function public.guard_ledger_immutable()
returns trigger language plpgsql set search_path = public as
$$
begin
  raise exception 'ledger_entries: ledger records are append-only';
  return null;
end;
$$;

drop trigger if exists guard_ledger_immutable on public.ledger_entries;

create trigger guard_ledger_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.guard_ledger_immutable();

create or replace function public.guard_commission_rule_versions()
returns trigger language plpgsql set search_path = public as
$$
begin
  if TG_OP = 'DELETE' then
    raise exception 'commission_rules: rule versions are never deleted';
  end if;
  if current_setting('app.commission_close', true) = 'on'
     and old.effective_to is null
     and new.effective_to is not null
     and new.effective_to > old.effective_from
     and new.id is not distinct from old.id
     and new.category_id is not distinct from old.category_id
     and new.rate is not distinct from old.rate
     and new.effective_from is not distinct from old.effective_from
     and new.created_by is not distinct from old.created_by
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'commission_rules: rule versions are immutable (create a new version instead)';
  return null;
end;
$$;

drop trigger if exists guard_commission_rule_versions on public.commission_rules;

create trigger guard_commission_rule_versions
  before update or delete on public.commission_rules
  for each row execute function public.guard_commission_rule_versions();

-- ============================================================
-- STEP 5: create_commission_rule() — the ONLY versioning path
-- ============================================================
-- Super-admin-only. Closes the currently open row in scope
-- (via the STEP 4 flag exemption) and inserts the new open
-- version atomically, with scope rows locked so concurrent
-- writers serialize. Overlap is rejected: after closing, no
-- row in scope may still cover the new effective_from.

create or replace function public.create_commission_rule(
  p_category_id uuid,
  p_rate numeric,
  p_effective_from timestamp with time zone
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_caller uuid := auth.uid();
  v_rate numeric(5, 2);
  v_new_id uuid;
begin
  -- (1) Authenticated super admin only.
  if v_caller is null then
    raise exception 'commission: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'commission: super-administrator access required';
  end if;

  -- (2) Rate + effective date shape. The rate is configuration,
  -- never a computed amount; amounts are derived at recognition.
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'commission: rate must be between 0 and 100';
  end if;
  v_rate := (floor(p_rate * 100 + 0.5) / 100)::numeric(5, 2);
  if p_effective_from is null then
    raise exception 'commission: effective date is required';
  end if;

  -- (3) Category scope must exist; NULL means global default.
  if p_category_id is not null then
    perform 1 from public.categories where id = p_category_id;
    if not found then
      raise exception 'commission: category not found';
    end if;
  end if;

  -- (4) Serialize writers in this scope.
  perform 1
  from public.commission_rules
  where category_id is not distinct from p_category_id
  for update;

  -- (5) Close the open row, if any (flag-armed exemption).
  perform set_config('app.commission_close', 'on', true);
  update public.commission_rules
  set effective_to = p_effective_from
  where category_id is not distinct from p_category_id
    and effective_to is null
    and effective_from < p_effective_from;

  -- (6) Overlap guard: nothing in scope may still cover the
  -- new effective date (rejects backdating into live history).
  if exists (
    select 1 from public.commission_rules
    where category_id is not distinct from p_category_id
      and coalesce(effective_to, 'infinity'::timestamp with time zone) > p_effective_from
  ) then
    raise exception 'commission: effective date overlaps an existing rule version';
  end if;

  -- (7) Insert the new open version.
  insert into public.commission_rules
    (category_id, rate, effective_from, effective_to, created_by)
  values
    (p_category_id, v_rate, p_effective_from, null, v_caller)
  returning id into v_new_id;

  -- (8) Audit: actor + scope reference only. No amounts beyond
  -- the configured rate (stored on the row itself), no secrets.
  insert into public.admin_audit_log
    (action, admin_id, target_user_id, application_id, product_id, shop_id, order_id)
  values
    ('commission.rule_created', v_caller, null, null, null, null, null);

  return v_new_id;
end;
$$;

revoke all on function public.create_commission_rule(uuid, numeric, timestamp with time zone) from public, anon, service_role;
grant execute on function public.create_commission_rule(uuid, numeric, timestamp with time zone) to authenticated;

-- ============================================================
-- STEP 6: commission read RPCs (super-admin-only)
-- ============================================================
-- Display routing only: current applicable rules plus full
-- version history. Non-super-admins receive zero rows (never
-- an error that oracles the role). Category names are joined
-- for the console; NULL category means global default.

create or replace function public.get_commission_rules()
returns table (
  rule_id uuid,
  category_id uuid,
  category_name text,
  rate numeric,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  in_effect boolean,
  created_by uuid,
  created_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.category_id, c.name, r.rate,
         r.effective_from, r.effective_to,
         (r.effective_from <= now()
          and (r.effective_to is null or r.effective_to > now())),
         r.created_by, r.created_at
  from public.commission_rules r
  left join public.categories c on c.id = r.category_id
  where public.is_super_admin()
    and r.effective_to is null
  order by r.category_id nulls first, r.effective_from desc;
$$;

revoke all on function public.get_commission_rules() from public, anon, service_role;
grant execute on function public.get_commission_rules() to authenticated;

create or replace function public.get_commission_rule_history(p_category_id uuid)
returns table (
  rule_id uuid,
  category_id uuid,
  category_name text,
  rate numeric,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  in_effect boolean,
  created_by uuid,
  created_at timestamp with time zone
)
language sql stable security definer set search_path = public, pg_temp as
$$
  select r.id, r.category_id, c.name, r.rate,
         r.effective_from, r.effective_to,
         (r.effective_from <= now()
          and (r.effective_to is null or r.effective_to > now())),
         r.created_by, r.created_at
  from public.commission_rules r
  left join public.categories c on c.id = r.category_id
  where public.is_super_admin()
    and (p_category_id is null
         or r.category_id is not distinct from p_category_id)
  order by r.category_id nulls first, r.effective_from desc;
$$;

revoke all on function public.get_commission_rule_history(uuid) from public, anon, service_role;
grant execute on function public.get_commission_rule_history(uuid) to authenticated;

-- ============================================================
-- STEP 7: recognize_earning() — idempotent earning recognition
-- ============================================================
-- Admin-path recognition for one delivered order item. Every
-- money/ownership fact derives from locked database rows:
-- seller from the item, gross from line_subtotal, commission
-- from the rule effective at recognition time, currency from
-- the parent order. Gating reuses the Phase 22 + 013 facts:
-- order payment_status must be paid, item fulfillment must be
-- delivered. Idempotency key 'earning:<item_id>' plus the
-- item lock converge repeats and races to the single row.
-- No audit row here by design: the ledger row IS the history
-- (audit flooding avoided); commission configuration changes
-- remain audited in STEP 5.

create or replace function public.recognize_earning(p_order_item_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_caller uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_category_id uuid;
  v_rule public.commission_rules%rowtype;
  v_gross numeric(12, 2);
  v_commission numeric(12, 2);
  v_net numeric(12, 2);
  v_ref text;
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- (1) Authenticated admin path only. (A future phase may
  -- invoke this from the fulfillment context instead; the
  -- row-level facts checked below stay identical.)
  if v_caller is null then
    raise exception 'earning: authentication required';
  end if;
  if not public.is_admin() then
    raise exception 'earning: administrator access required';
  end if;

  -- (2) Lock the authoritative item row.
  select * into v_item
  from public.order_items
  where id = p_order_item_id
  for update;
  if not found then
    raise exception 'earning: order item not found';
  end if;

  -- (3) Replay-first idempotency: return the original row.
  v_ref := 'earning:' || p_order_item_id::text;
  select id into v_existing_id
  from public.ledger_entries
  where reference_key = v_ref;
  if found then
    return v_existing_id;
  end if;

  -- (4) Lock the parent and require Phase 22 payment fact.
  select * into v_order
  from public.orders
  where id = v_item.order_id
  for update;
  if not found then
    raise exception 'earning: parent order not found';
  end if;
  if v_order.payment_status is distinct from 'paid' then
    raise exception 'earning: order payment is not confirmed';
  end if;

  -- (5) Require 013 delivered fact. Single-item delivery never
  -- confirms payment (022), and recognition never precedes it.
  if v_item.fulfillment_status is distinct from 'delivered' then
    raise exception 'earning: order item is not delivered';
  end if;

  -- (6) Resolve the authoritative category from the product.
  select category_id into v_category_id
  from public.products
  where id = v_item.product_id;
  if not found or v_category_id is null then
    raise exception 'earning: product category not found';
  end if;

  -- (7) Resolve the rule effective NOW: category override
  -- first, else global default. Absent rules fail closed so
  -- silent zero-commission earnings are impossible.
  select * into v_rule
  from public.commission_rules
  where category_id = v_category_id
    and effective_from <= now()
    and (effective_to is null or effective_to > now())
  order by effective_from desc
  limit 1;
  if not found then
    select * into v_rule
    from public.commission_rules
    where category_id is null
      and effective_from <= now()
      and (effective_to is null or effective_to > now())
    order by effective_from desc
    limit 1;
  end if;
  if not found then
    raise exception 'earning: no applicable commission rule';
  end if;

  -- (8) Server-side money math (half-up to cents; discount
  -- share dormant 0 until the allocation phase).
  v_gross := v_item.line_subtotal;
  v_commission := (floor(v_gross * v_rule.rate + 0.5) / 100)::numeric(12, 2);
  v_net := v_gross - v_commission;

  -- (9) Append the immutable earning row. Races converge on
  -- the unique reference key into the replay path.
  begin
    insert into public.ledger_entries (
      seller_id, order_id, order_item_id, entry_type,
      amount, currency, commission_rule_id, commission_rate,
      gross_amount, commission_amount, discount_amount, net_amount,
      reference_key, source, metadata
    )
    values (
      v_item.seller_id, v_item.order_id, v_item.id, 'earning',
      v_net, v_order.currency, v_rule.id, v_rule.rate,
      v_gross, v_commission, 0, v_net,
      v_ref, 'earning_recognition', null
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

  return v_new_id;
end;
$$;

revoke all on function public.recognize_earning(uuid) from public, anon, service_role;
grant execute on function public.recognize_earning(uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - commission_rules: global (NULL) + category scopes, rate
--   0-100, versioned history via close-and-insert, one open
--   row per scope (partial unique), overlap rejected, edits
--   and deletes trigger-blocked (flag-armed close only).
-- - ledger_entries: item-level earning rows with gross /
--   rule / rate / commission / net snapshots, dormant
--   discount_amount, unique idempotency keys, future-vocab
--   type CHECK, absolute append-only trigger.
-- - RLS default-deny: super-admin-only config reads, seller
--   own-ledger reads, customers nothing, zero client writes.
-- - create_commission_rule(): super-admin + locks + overlap
--   guard + versioning + audit, id-only return.
-- - Read RPCs: super-admin predicate (zero rows otherwise).
-- - recognize_earning(): admin path + locks + paid/delivered
--   gates + effective-now rule resolution (category, else
--   global, else fail closed) + half-up server math +
--   replay-first idempotency + race convergence, id return.
-- - 001-016 objects untouched (new names only); EXECUTE to
--   authenticated with in-function gates throughout.
-- -----------------------------------------------------
