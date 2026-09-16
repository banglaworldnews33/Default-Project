-- -----------------------------------------------------
-- Phase 3C: Secure Seller Approval foundation (Model 1)
-- -----------------------------------------------------
-- Implements the approved Model 1 architecture: application-gated
-- promotion. A customer applies while remaining role='customer'; an
-- admin RPC flips customer -> seller + verified ONLY when a pending
-- application exists. There is deliberately NO client-writable path
-- to any privileged role or status.
--
-- Business rules enforced here:
-- - Customers need NO approval and shop immediately (untouched).
-- - A pending applicant MUST NOT be a seller (role stays customer).
-- - Only an authenticated admin action approves/rejects (RPC-gated).
-- - Approval changes exactly: customer + pending application
--   -> seller + verified. Nothing else.
-- - Rejection NEVER touches the customer's profile role.
-- - Customers cannot self-promote; sellers cannot become admin.
-- - Admin creation stays owner-controlled (direct SQL INSERT by the
--   table owner, which bypasses RLS; the guard trigger is UPDATE-only
--   so the bootstrap insert succeeds). No code path creates admins.
-- - No service_role key belongs in frontend code, before or after this.
--
-- Design notes (why Model 1, not a pending-seller role):
-- - role='seller' therefore MEANS approved. Future products/orders
--   policies can check role alone; no policy can forget a status check
--   and leak selling rights to pending applicants.
-- - Role/status immutability stays trigger-enforced for EVERY writer.
--   The trigger exemption below is flag-gated (SET LOCAL inside the
--   approval RPC) and transition-gated (exact customer/pending ->
--   seller/verified). There is NO service_role bypass.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: seller_applications table
-- ============================================================
-- One row per seller application. Minimal business fields for now;
-- documents/verification details belong to a later phase.
-- user_id anchors to auth.users (valid for every authenticated user,
-- even before a profiles row exists), cascades on user deletion.

create table if not exists public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  business_name text not null check (char_length(business_name) between 1 and 200),
  phone text check (phone is null or char_length(phone) between 1 and 32),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references auth.users on delete set null,
  reviewed_at timestamp with time zone,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Only ONE pending application per user. Rejected users may re-apply
-- with a fresh row; each application is reviewed independently.

create unique index if not exists idx_seller_applications_one_pending
  on public.seller_applications (user_id)
  where status = 'pending';

create index if not exists idx_seller_applications_user on public.seller_applications (user_id);
create index if not exists idx_seller_applications_status on public.seller_applications (status);

-- Reuse the updated_at maintainer from 001/002 (function already exists;
-- only the trigger is (re)attached here).

drop trigger if exists handle_seller_applications_updated_at on public.seller_applications;

create trigger handle_seller_applications_updated_at
  before update on public.seller_applications
  for each row
  execute function public.handle_updated_at();

-- ============================================================
-- STEP 2: admin_audit_log table (append-only, RPC-written)
-- ============================================================
-- Immutable trail of privileged actions. Deliberately NO foreign keys:
-- audit rows must survive even if a user row is later deleted.
-- Deliberately NO client write policies: only SECURITY DEFINER
-- functions insert here.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 100),
  admin_id uuid,
  target_user_id uuid,
  application_id uuid,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_admin_audit_admin on public.admin_audit_log (admin_id);
create index if not exists idx_admin_audit_target on public.admin_audit_log (target_user_id);
create index if not exists idx_admin_audit_application on public.admin_audit_log (application_id);
create index if not exists idx_admin_audit_created on public.admin_audit_log (created_at);

-- ============================================================
-- STEP 3: Narrow the privilege-escalation guard trigger
-- ============================================================
-- Same immutability for every writer as 001/002, plus ONE exemption:
-- the exact approval transition, and ONLY inside a transaction where
-- an approval RPC has set the local flag via set_config(..., true).
-- SET LOCAL is transaction-scoped (auto-reset; cannot leak sessions).
-- current_setting(..., true) returns NULL when unset -> comparison is
-- not true -> raise. Fail-closed by construction.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path = public as
$$
begin
  -- id / created_at are immutable for everyone, always. No exemption.
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id and created_at are immutable';
  end if;

  -- role / verification_status may change ONLY via the exact approval
  -- transition, executed inside the admin approval RPC (flag-gated).
  if new.role is distinct from old.role
     or new.verification_status is distinct from old.verification_status then
    if not (
      current_setting('app.seller_approval', true) = 'on'
      and old.role = 'customer'
      and old.verification_status = 'pending'
      and new.role = 'seller'
      and new.verification_status = 'verified'
    ) then
      raise exception 'profiles: role and verification_status are immutable (use the seller approval workflow)';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privilege_escalation on public.profiles;

create trigger guard_profile_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_escalation();

-- ============================================================
-- STEP 4: approve_seller_application() — the ONLY promotion path
-- ============================================================
-- Atomic single-transaction RPC. Fails closed: any failed assertion
-- aborts the whole transaction, so no half-approved state can persist.

drop function if exists public.approve_seller_application(uuid);

create or replace function public.approve_seller_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_admin_id uuid := auth.uid();
  v_app public.seller_applications%rowtype;
  v_target_role text;
begin
  -- (a) Authenticated caller only. service_role/API keys without a user
  --     JWT have NULL auth.uid() and are rejected here too.
  if v_admin_id is null then
    raise exception 'seller approval: authentication required';
  end if;

  -- (b) Admin only. Role is read from the profiles table via the
  --     recursion-safe helper, never from JWT claims or client input.
  if not public.is_admin() then
    raise exception 'seller approval: administrator access required';
  end if;

  -- (c) Application must exist and be pending. FOR UPDATE serializes
  --     concurrent approvals: the loser sees non-pending and raises.
  select * into v_app
  from public.seller_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'seller approval: application not found';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'seller approval: application is not pending';
  end if;

  -- (d) Target must exist and be exactly role='customer'. This single
  --     check simultaneously forbids: customer->admin, seller->admin,
  --     admin->anything, and double approval.
  select role into v_target_role
  from public.profiles
  where id = v_app.user_id
  for update;
  if not found then
    raise exception 'seller approval: applicant profile not found';
  end if;
  if v_target_role <> 'customer' then
    raise exception 'seller approval: applicant is not a customer';
  end if;

  -- (e) Arm the narrow trigger exemption for THIS transaction only.
  perform set_config('app.seller_approval', 'on', true);

  -- (f) Exact approval transition. Nothing else is written.
  update public.seller_applications
  set status = 'approved',
      reviewer_id = v_admin_id,
      reviewed_at = timezone('utc'::text, now()),
      rejection_reason = null
  where id = p_application_id;

  update public.profiles
  set role = 'seller',
      verification_status = 'verified'
  where id = v_app.user_id;

  -- (g) Audit trail. Reviewer id comes from the session, never input.
  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('seller.approved', v_admin_id, v_app.user_id, p_application_id);

  -- Return the application id only. No profile data leaves the function.
  return p_application_id;
end;
$$;

-- EXECUTE is granted to authenticated ONLY. Explicitly revoked from
-- PUBLIC, anon, AND service_role: the browser/client path uses the
-- authenticated role exclusively, and there is no service_role bypass
-- (the function's internal is_admin() gate would reject such callers
-- regardless, since their auth.uid() is NULL).
revoke all on function public.approve_seller_application(uuid) from public, anon, service_role;
grant execute on function public.approve_seller_application(uuid) to authenticated;

-- ============================================================
-- STEP 5: reject_seller_application() — status-only, never profile
-- ============================================================

drop function if exists public.reject_seller_application(uuid, text);

create or replace function public.reject_seller_application(p_application_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_admin_id uuid := auth.uid();
  v_app public.seller_applications%rowtype;
  v_target_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_admin_id is null then
    raise exception 'seller rejection: authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'seller rejection: administrator access required';
  end if;

  select * into v_app
  from public.seller_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'seller rejection: application not found';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'seller rejection: application is not pending';
  end if;

  -- Same target guard as approval: only a customer's application can be
  -- rejected through this path (symmetric, auditable, no surprises).
  select role into v_target_role
  from public.profiles
  where id = v_app.user_id
  for update;
  if not found then
    raise exception 'seller rejection: applicant profile not found';
  end if;
  if v_target_role <> 'customer' then
    raise exception 'seller rejection: applicant is not a customer';
  end if;

  -- Application row ONLY. The customer's profile (role/status) is
  -- deliberately untouched: rejection must not alter customer state.
  update public.seller_applications
  set status = 'rejected',
      reviewer_id = v_admin_id,
      reviewed_at = timezone('utc'::text, now()),
      rejection_reason = v_reason
  where id = p_application_id;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('seller.rejected', v_admin_id, v_app.user_id, p_application_id);

  return p_application_id;
end;
$$;

-- Same least-privilege rule as approve: authenticated ONLY.
-- No PUBLIC, no anon, no service_role EXECUTE, no bypass.
revoke all on function public.reject_seller_application(uuid, text) from public, anon, service_role;
grant execute on function public.reject_seller_application(uuid, text) to authenticated;

-- ============================================================
-- STEP 6: RLS for the new tables (least privilege, no weakening)
-- ============================================================

alter table public.seller_applications enable row level security;
alter table public.admin_audit_log enable row level security;

-- 6a. Applicants INSERT only their own row, forced status='pending',
--     with reviewer fields locked NULL (set only by the RPCs later),
--     AND only while their own profile role is exactly 'customer'.
--     Recursion safety: the subquery reads public.profiles, a DIFFERENT
--     table from this policy's own seller_applications, so no RLS
--     recursion is possible. That subquery is itself governed by the
--     profiles SELECT policies (owner-read passes for one's own row;
--     the admin branch uses the recursion-safe is_admin() helper).
--     Applicants without a profile row (or with a non-customer role)
--     are denied: in the app every signed-in user already owns a
--     customer profile (created on first session), so legitimate
--     applicants are unaffected. Customer shopping behavior is
--     untouched: this policy gates application filing only.

drop policy if exists "Applicants can insert own pending application" on public.seller_applications;

create policy "Applicants can insert own pending application"
  on public.seller_applications for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewer_id is null
    and reviewed_at is null
    and rejection_reason is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role = 'customer'
    )
  );

-- 6b. Applicants read only their own applications.

drop policy if exists "Applicants can view own applications" on public.seller_applications;

create policy "Applicants can view own applications"
  on public.seller_applications for select
  using (user_id = auth.uid());

-- 6c. Admins read all applications (recursion-safe helper).

drop policy if exists "Admins can view all applications" on public.seller_applications;

create policy "Admins can view all applications"
  on public.seller_applications for select
  using (public.is_admin());

-- NOTE: intentionally NO update/delete policies on seller_applications.
-- Status transitions happen ONLY inside the SECURITY DEFINER RPCs,
-- which run with owner privileges and enforce their own gates.

-- 6d. Audit log: admin SELECT only. No client write policies at all;
--     rows are written exclusively by the definer RPCs above.

drop policy if exists "Admins can view audit log" on public.admin_audit_log;

create policy "Admins can view audit log"
  on public.admin_audit_log for select
  using (public.is_admin());

-- 6e. profiles policies are NOT touched: the 001/002 security model
--     (owner read, exact-default insert, owner update + guard trigger,
--     admin read) is preserved verbatim. No broad UPDATE is added.

-- ============================================================
-- STEP 7: Explicit least-privilege GRANTs (new objects only)
-- ============================================================
-- Grants decide reachability; policies decide visibility. Deny first,
-- then grant the minimum each role needs. profiles grants are
-- deliberately left as-is (working app dependency; out of scope).

revoke all on public.seller_applications from public, anon;
revoke all on public.admin_audit_log from public, anon;

-- Applicants need to file and track their own applications.
grant select, insert on public.seller_applications to authenticated;

-- Admins read applications + audit through the is_admin() policies
-- above; non-admins holding the grant still see zero rows.
grant select on public.admin_audit_log to authenticated;

-- No UPDATE/DELETE grants on seller_applications to any client role.
-- No INSERT/UPDATE/DELETE grants on admin_audit_log to any client role.
-- RPC EXECUTE is granted narrowly per function (steps 4-5).

-- ============================================================
-- SUMMARY (what this migration guarantees)
-- ============================================================
-- - Pending applicants are NEVER sellers (role untouched until approval).
-- - Promotion is possible ONLY via approve_seller_application(), ONLY
--   by an admin, ONLY for a customer with a pending application, ONLY
--   to exactly seller+verified, atomically, with an audit row.
-- - Rejection never alters customer state.
-- - No client role can UPDATE/DELETE applications or write audit rows.
-- - The guard trigger still blocks every other role/status/id/created_at
--   change for every writer; there is no service_role bypass.
-- - service_role key still belongs nowhere near the frontend.
--------------------------------------------------------------------
