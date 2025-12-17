-- Migration: Update users role constraint to include viewer/editor
--
-- The invitations system uses viewer/editor/admin roles, but the users table
-- only allowed owner/admin/member. This caused constraint violations when
-- creating user profiles from invitations.

-- Drop old constraint and create new one with all role values
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member'));

-- Note: 'member' is kept for backward compatibility with existing users
