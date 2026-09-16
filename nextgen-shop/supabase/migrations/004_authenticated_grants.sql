-- -----------------------------------------------------
-- Phase 3C: Least-privilege table GRANTs for `authenticated`
-- -----------------------------------------------------
-- Context: live security testing proved that RLS policies from
-- 001-003 are correctly restrictive, but the `authenticated` role
-- holds no table GRANTs on `profiles` (and none on
-- `seller_applications` beyond defaults), so even legitimate
-- owner reads/writes fail with 42501 "permission denied" BEFORE
-- any RLS policy is evaluated. Grants decide reachability;
-- policies decide visibility. This migration adds the minimum
-- reachability the app needs — nothing more.
--
-- What this migration does NOT do (explicit non-goals):
-- - No change to any RLS policy (001/002/003 untouched).
-- - No grant to `anon` or `PUBLIC` (public boundary stays sealed).
-- - No UPDATE/DELETE on seller_applications (transitions stay RPC-only).
-- - No writes on admin_audit_log (RPC-only appends; SELECT grant
--   already exists from 003 and is left exactly as-is).
-- - No function EXECUTE changes (002/003 RPC grants untouched).
-- - No Auth configuration changes.
-- -----------------------------------------------------

-- Profiles: the app (AuthContext ensureProfile/getProfile, LoginPage)
-- needs to read the caller's own row, insert the caller's own
-- customer row at signup, and reach the owner-UPDATE policy path
-- (role/status changes remain impossible via the guard trigger).
-- DELETE is intentionally never granted: profile rows are never
-- client-deletable (account removal is an owner/admin operation).

grant select, insert, update on public.profiles to authenticated;

-- Seller applications: applicants file (INSERT, constrained by the
-- exact-default WITH CHECK policy) and track (SELECT, owner +
-- admin policies) their own applications. UPDATE/DELETE are
-- intentionally never granted: status transitions happen ONLY
-- inside approve_seller_application() / reject_seller_application().

grant select, insert on public.seller_applications to authenticated;

-- End of migration 004. Apply AFTER 001, 002, 003, in order.
--------------------------------------------------------------------
