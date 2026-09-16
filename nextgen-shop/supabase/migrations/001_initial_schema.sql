-- -----------------------------------------------------
-- Phase 2: Supabase Security Foundation — profiles table
-- -----------------------------------------------------
-- WARNING: This migration creates the profiles table that links
-- to auth.users. RLS policies enforce role-based access.
-- Never trust role data from the browser; always verify via
-- auth.uid() + RLS in the database.
--
-- NOTE (Phase 3B static review): RLS policy expressions cannot
-- reference NEW/OLD and cannot contain self-referencing subqueries
-- on the same table (infinite recursion). Role immutability is
-- therefore enforced by the prevent_profile_privilege_escalation
-- trigger below, not by policy expressions. Admin checks use the
-- SECURITY DEFINER is_admin() helper (see 002) for the same reason.
-- -----------------------------------------------------

-- 1. Create the profiles table (executed once)
--    id references auth.users with ON DELETE CASCADE
--    role and verification_status have CHECK constraints and safe DEFAULTs.
--    New users default to role='customer', verification_status='pending'.
--

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null unique,
  email text,
  phone text,
  name text,
  role text not null default 'customer' check (role in ('customer', 'seller', 'admin')),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  onboarding_complete boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- 2. updated_at maintenance function (must exist BEFORE the trigger).
--

create or replace function public.handle_updated_at()
returns trigger language plpgsql set search_path = public as
$$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- 3. Guard trigger: role, verification_status, id and created_at are
--    immutable. RLS WITH CHECK cannot compare old vs new rows, so a
--    BEFORE UPDATE trigger is the correct enforcement point. It fires
--    for every writer (anon/authenticated/service_role alike).
--

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

-- 4. Attach the updated_at trigger.
--

drop trigger if exists handle_profiles_updated_at on public.profiles;

create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- 5. Enable Row Level Security (RLS) on profiles.
--

alter table public.profiles enable row level security;

-- 6. RLS POLICIES (foundation set; hardened further in 002).
--    Re-runnable: drop-then-create so replays do not fail.
--

-- 6a. Users can read their own profile only. No public/anonymous read.
--

drop policy if exists "Users can view own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 6b. Authenticated users can insert ONLY their own row, and ONLY with
--      the safe defaults. The exact-equality checks (not IS NULL) mean
--      seller/admin roles can never be self-granted at sign-up.
--

drop policy if exists "Secure profile insert" on public.profiles;

create policy "Secure profile insert"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and role = 'customer'
    and verification_status = 'pending'
  );

-- 6c. Users can update ONLY their own row. Sensitive columns are
--      protected by the guard trigger above, not by policy expressions
--      (PostgreSQL RLS cannot reference NEW/OLD).
--

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- NOTE: there is intentionally NO delete policy: deletes are blocked
-- for all client roles. Admins operate via service_role / backend only.
-- Admin SELECT access is added in 002 via the is_admin() helper.

-- 7. Indexes for common lookups.
--

create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_verification on public.profiles (verification_status);
create index if not exists idx_profiles_auth_id on public.profiles (id);

-- Security note: the objects above ensure that:
-- - RLS is enabled; no anonymous/public profile reads.
-- - Inserts are limited to the sign-up user's own row with
--   role='customer', verification_status='pending'.
-- - Updates are limited to the user's own row, and the trigger makes
--   role/verification_status/id/created_at immutable for every writer.
-- - update_profile() style controlled writes never touch role/status.
-- - Never use localStorage or browser-stored data for authorization.
-- - The service_role key must never appear in frontend bundles or env vars.
--------------------------------------------------------------------
