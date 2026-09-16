-- -----------------------------------------------------
-- Phase 5: seller application storefront fields (RLS-neutral)
-- -----------------------------------------------------
-- WHY this migration exists: the seller registration UI must persist
-- a business description and shop category somewhere REAL (a form
-- that silently drops input would be fake). These two NULLABLE text
-- columns extend seller_applications without touching the security
-- model at all:
--
-- - No RLS policy references these columns. The INSERT policy still
--   constrains exactly user_id / status / reviewer fields; SELECT
--   policies are row-based (`select *` picks the new columns up under
--   the SAME existing policies).
-- - No new grants (existing SELECT/INSERT for authenticated cover the
--   wider row; no UPDATE/DELETE is added anywhere).
-- - No function/trigger changes: the guard trigger watches profiles
--   role/status only; handle_updated_at() is column-agnostic.
-- - CHECKs keep lengths sane. NULL means "not provided".
--
-- Apply AFTER 001, 002, 003 (004 order-independent). Idempotent.
-- -----------------------------------------------------

alter table public.seller_applications
  add column if not exists description text
    check (description is null or char_length(description) between 1 and 2000),
  add column if not exists shop_category text
    check (shop_category is null or char_length(shop_category) between 1 and 100);

-- No policy, grant, function, or trigger changes. RLS behavior for
-- seller_applications is byte-for-byte identical to 003 (+004 grants).
--------------------------------------------------------------------
