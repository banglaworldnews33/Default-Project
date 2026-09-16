-- -----------------------------------------------------
-- Phase 2 Security Hardening — profiles table RLS policies
-- -----------------------------------------------------
-- Run AFTER 001_initial_schema.sql.
--
-- Security improvements:
-- 1. Removes every legacy permissive policy (including the ones from
--    the pre-3B revision of 001: public read, open insert, and the
--    self-referencing "Sellers can view own profile" policy which
--    causes infinite RLS recursion).
-- 2. INSERT requires the exact safe defaults (customer/pending).
-- 3. Role/status immutability enforced by trigger (RLS WITH CHECK
--    cannot reference NEW/OLD and cannot use comma-separated checks).
-- 4. Admin reads use the SECURITY DEFINER is_admin() helper with an
--    explicit search_path (an EXISTS subquery on profiles inside a
--    profiles policy recurses infinitely — never do that).
-- 5. update_profile() rewritten in plpgsql with an ownership/admin
--    guard and a safe search_path.
-- 6. Trigger/function ordering fixed: functions are (re)created
--    BEFORE the triggers that depend on them.
-- -----------------------------------------------------

-- ============================================================
-- STEP 1: Drop ALL legacy permissive policies (old + current names)
-- ============================================================

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Customers can insert own profile" on public.profiles;
drop policy if exists "Customers can update own profile" on public.profiles;
drop policy if exists "Sellers can view own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Secure profile insert" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can update own profile (safe fields only)" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;

-- ============================================================
-- STEP 2: Recursion-safe admin helper
-- ============================================================
-- A policy on profiles may NOT run a subquery against profiles
-- (infinite recursion). This SECURITY DEFINER function runs with the
-- owner's privileges, bypasses RLS, and is safe to call from policies.
-- It answers exactly one question: is the caller an admin?
-- It reveals nothing else and cannot be used to escalate (it performs
-- no writes and takes no role argument).

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ============================================================
-- STEP 3: Strict SELECT policies (no public/anonymous access)
-- ============================================================

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

-- ============================================================
-- STEP 4: Secure INSERT (exact safe defaults, own row only)
-- ============================================================

create policy "Secure profile insert"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and role = 'customer'
    and verification_status = 'pending'
  );

-- ============================================================
-- STEP 5: Secure UPDATE (own row; immutability via trigger)
-- ============================================================

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- The guard trigger from 001 is re-ensured here (idempotent) so that
-- role, verification_status, id and created_at stay immutable even if
-- 001 was applied in its pre-3B form.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql set search_path = public as
$$
begin
  if new.role is distinct from old.role
     or new.verification_status is distinct from old.verification_status
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles: role, verification_status, id and created_at are immutable';
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
-- STEP 6: Controlled-write helper update_profile()
-- ============================================================
-- Limited to name/phone. The ownership/admin guard runs inside the
-- function (definer context), so a caller can only touch their own
-- row unless they are an admin. Role/status can never change here.

drop function if exists public.update_profile(uuid, text, text);

create or replace function public.update_profile(
  p_id uuid,
  p_name text,
  p_phone text
) returns void language plpgsql security definer set search_path = public as
$$
begin
  if p_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'profiles: can only update your own profile';
  end if;
  update public.profiles
  set name = p_name,
      phone = p_phone,
      updated_at = timezone('utc'::text, now())
  where id = p_id;
end;
$$;

revoke all on function public.update_profile(uuid, text, text) from public, anon;
grant execute on function public.update_profile(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- STEP 7: updated_at trigger (functions BEFORE triggers)
-- ============================================================

drop trigger if exists handle_profiles_updated_at on public.profiles;
drop function if exists public.handle_updated_at() cascade;

create or replace function public.handle_updated_at()
returns trigger language plpgsql set search_path = public as
$$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- ============================================================
-- STEP 8: Indexes (idempotent)
-- ============================================================

create index if not exists idx_profiles_own_id on public.profiles (id);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_verification on public.profiles (verification_status);

-- ============================================================
-- SECURITY HARDENING SUMMARY
-- ============================================================
-- No public/anonymous profile reads. INSERT forces the caller's own
-- row with role='customer', verification_status='pending'. UPDATE is
-- own-row only and the trigger makes role/status/id/created_at
-- immutable for every database writer. Admin checks go through the
-- recursion-safe is_admin() helper. update_profile() touches only
-- name/phone with an ownership guard. service_role key never belongs
-- in frontend code or env vars.
--------------------------------------------------------------------
