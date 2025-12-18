-- ============================================
-- Migration 015: Fix invitations role constraint
-- ============================================
-- Add 'consultant', 'editor', 'viewer' to the invitations role check constraint
-- to match the roles available in organization_members

-- Drop the existing constraint and add a new one with all roles
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'consultant', 'member'));

-- ============================================
-- Summary
-- ============================================
-- Updated invitations.role check constraint to include all valid roles:
-- owner, admin, editor, viewer, consultant, member
