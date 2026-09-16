-- -----------------------------------------------------
-- Phase 11: super-admin-only admin permission grant/revoke
-- -----------------------------------------------------
-- WHY this migration exists:
--
-- Roles are trigger-immutable for every writer (001/002/003), and
-- the ONLY permitted transition is customer/pending ->
-- seller/verified inside approve_seller_application(). There is no
-- path to role='admin' anywhere: admins exist solely by direct
-- owner SQL (003 design). Migration 010 added super-admin
-- membership (super_admins) but deliberately cannot grant the
-- admin role itself (add_super_admin requires the target to
-- already be an admin).
--
-- This migration adds the missing, minimal, super-admin-only
-- permission control:
-- - grant_admin_permission(): customer -> admin
-- - revoke_admin_permission(): admin -> customer
--
-- WHAT this migration does NOT do (explicit non-goals):
-- - No change to migrations 001-010 (files untouched; the trigger
--   function is superseded here via CREATE OR REPLACE, the same
--   pattern 002/003 used — old files are never edited).
-- - No change to any RLS policy, GRANT, table, index, or existing
--   RPC. In particular: no direct UPDATE grant on profiles, no
--   public write access, no RLS weakening.
-- - No change to the seller approval transition or its flag.
-- - No email/UUID-based authorization, no frontend flags, no
--   service_role involvement, no secrets of any kind.
-- - No DELETE policies added anywhere.
-- - No existing data modified.
--
-- Apply AFTER 001-010, in order. Idempotent in style.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: extend the privilege-escalation guard trigger
-- ============================================================
-- The 003 version of this function is replaced with an identical
-- body plus ONE additional narrow branch: the exact grant/revoke
-- transitions (customer <-> admin, verification_status unchanged),
-- and ONLY inside a transaction where a permission RPC below has
-- set the local flag via set_config(..., true).
--
-- SET LOCAL is transaction-scoped (auto-reset; cannot leak
-- sessions). current_setting(..., true) returns NULL when unset
-- -> comparison is not true -> raise. Fail-closed by
-- construction. Normal client SQL/RPC callers can never set this
-- flag usefully: without is_super_admin() the RPCs raise before
-- touching any row, and the flag alone (even if set) permits only
-- the two exact transitions, never admin self-promotion (the RPCs
-- additionally gate on caller privilege + target state).

create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path = public as
$$
begin
  -- id / created_at are immutable for everyone, always. No exemption.
  if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id and created_at are immutable';
  end if;

  -- role / verification_status may change ONLY via the exact
  -- transitions below. Anything else raises for every writer.
  if new.role is distinct from old.role
     or new.verification_status is distinct from old.verification_status then

    -- Branch (a) — seller approval (003, unchanged): exact
    -- customer/pending -> seller/verified inside the approval RPC.
    if not (
      current_setting('app.seller_approval', true) = 'on'
      and old.role = 'customer'
      and old.verification_status = 'pending'
      and new.role = 'seller'
      and new.verification_status = 'verified'
    ) then

      -- Branch (b) — admin permission grant/revoke (011, new):
      -- customer <-> admin with verification_status unchanged,
      -- inside the grant/revoke RPCs below. Nothing else passes.
      if not (
        current_setting('app.admin_grant', true) = 'on'
        and new.verification_status is not distinct from old.verification_status
        and (
          (old.role = 'customer' and new.role = 'admin')
          or (old.role = 'admin' and new.role = 'customer')
        )
      ) then
        raise exception 'profiles: role and verification_status are immutable (use the seller approval or admin permission workflow)';
      end if;

    end if;
  end if;

  return new;
end;
$$;

-- The trigger itself (name, timing, table) is unchanged; the
-- drop+create below only re-binds it to the replaced function
-- above, mirroring the 002/003 pattern. No other trigger,
-- policy, or grant is touched.

drop trigger if exists guard_profile_privilege_escalation on public.profiles;

create trigger guard_profile_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_escalation();

-- ============================================================
-- STEP 2: grant_admin_permission() — customer -> admin
-- ============================================================
-- Super-admin-only. The target must be a plain customer; this RPC
-- NEVER touches super_admins membership, so granting never
-- confers super-admin privilege. verification_status is preserved
-- (not read, not written). Actor comes from auth.uid(); the audit
-- row records caller + target. The whole body runs atomically in
-- the caller's transaction; the target row is locked first so
-- concurrent permission changes serialize on it.

create or replace function public.grant_admin_permission(p_target uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise exception 'admin grant: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'admin grant: super-administrator access required';
  end if;

  select role into v_role
  from public.profiles
  where id = p_target
  for update;
  if not found then
    raise exception 'admin grant: target user not found';
  end if;
  if v_role = 'admin' then
    raise exception 'admin grant: target is already an admin';
  end if;
  if v_role <> 'customer' then
    raise exception 'admin grant: target must be a customer';
  end if;

  -- Arm the narrow trigger exemption for THIS transaction only.
  perform set_config('app.admin_grant', 'on', true);

  update public.profiles
  set role = 'admin'
  where id = p_target;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('admin.granted', v_caller, p_target, null);
end;
$$;

revoke all on function public.grant_admin_permission(uuid) from public, anon, service_role;
grant execute on function public.grant_admin_permission(uuid) to authenticated;

-- ============================================================
-- STEP 3: revoke_admin_permission() — admin -> customer
-- ============================================================
-- Super-admin-only. A Super Admin member can NEVER be revoked
-- through this path: the membership check below fails safely and
-- directs the caller to remove super-admin membership first (via
-- the existing last-admin-guarded remove_super_admin()). The
-- revoked user returns to role='customer' with verification_status
-- preserved; a former seller-admin re-enters selling only through
-- the normal approval workflow (no silent privilege retention).

create or replace function public.revoke_admin_permission(p_target uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise exception 'admin revoke: authentication required';
  end if;
  if not public.is_super_admin() then
    raise exception 'admin revoke: super-administrator access required';
  end if;

  select role into v_role
  from public.profiles
  where id = p_target
  for update;
  if not found then
    raise exception 'admin revoke: target user not found';
  end if;
  if v_role <> 'admin' then
    raise exception 'admin revoke: target is not an admin';
  end if;

  perform 1 from public.super_admins where admin_id = p_target;
  if found then
    raise exception 'admin revoke: cannot revoke a super admin (remove super-admin membership first)';
  end if;

  -- Arm the narrow trigger exemption for THIS transaction only.
  perform set_config('app.admin_grant', 'on', true);

  update public.profiles
  set role = 'customer'
  where id = p_target;

  insert into public.admin_audit_log (action, admin_id, target_user_id, application_id)
  values ('admin.revoked', v_caller, p_target, null);
end;
$$;

revoke all on function public.revoke_admin_permission(uuid) from public, anon, service_role;
grant execute on function public.revoke_admin_permission(uuid) to authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- - Grant/revoke are super-admin-only DEFINER RPCs (EXECUTE:
--   authenticated; revoked from public/anon/service_role).
-- - Trigger allows exactly two new transitions (customer <->
--   admin, status preserved, flag-gated); approval branch and all
--   other rejections are byte-for-byte preserved.
-- - No RLS policy, GRANT, table, index, or existing RPC changed.
-- - No role value changes, no email/UUID authorization, no
--   self-promotion path, no super-admin membership path here
--   (010 RPCs unchanged, last-admin guard intact).
-- - Audit uses existing admin_audit_log (actor = auth.uid(),
--   target = p_target); no new audit table.
-- -----------------------------------------------------
