-- Migration: Partner Account System
--
-- This migration adds a Partner Account system with:
-- 1. Partner account type for agencies/freelancers
-- 2. New 'partner' role distinct from 'consultant'
-- 3. Home organization support for partners
-- 4. Migration of existing consultants to partner accounts
--
-- Key changes:
-- 1. Add account_type column to users: 'standard' | 'partner'
-- 2. Add home_organization_id for partner's agency org
-- 3. Add 'partner' role to organization_members
-- 4. Update invitation types to include 'partner'
-- 5. Create helper functions for partner operations
-- 6. Migrate existing consultants to partners

-- ============================================
-- 1. Add account_type and home_organization_id to users
-- ============================================

-- Add account_type column (default 'standard' for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'standard'
  CHECK (account_type IN ('standard', 'partner'));

-- Add home_organization_id for partner's own agency organization
-- This is separate from organization_id (which may be a client org)
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_organization_id UUID REFERENCES organizations(id);

-- Create index for home organization lookups
CREATE INDEX IF NOT EXISTS idx_users_home_org ON users(home_organization_id);

-- ============================================
-- 2. Add 'partner' role to organization_members
-- ============================================

-- Drop old constraint and add 'partner' role
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'consultant', 'partner'));

-- ============================================
-- 3. Update invitations table for partner invitations
-- ============================================

-- Update invitation_type constraint to include 'partner'
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invitation_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_invitation_type_check
  CHECK (invitation_type IN ('team', 'consultant', 'partner'));

-- Update role constraint to include 'partner'
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'consultant', 'member', 'partner'));

-- ============================================
-- 4. Helper Functions for Partner Operations
-- ============================================

-- Check if user is a partner (by account_type)
CREATE OR REPLACE FUNCTION user_is_partner(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND account_type = 'partner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get partner's home organization
CREATE OR REPLACE FUNCTION get_partner_home_org(p_auth_uid UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT
) AS $$
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id
  FROM users u
  JOIN organizations o ON o.id = u.home_organization_id
  WHERE u.auth_user_id = p_auth_uid
  AND u.account_type = 'partner'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get partner's client organizations (where they have 'partner' role)
CREATE OR REPLACE FUNCTION get_partner_clients(p_auth_uid UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
) AS $$
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    om.role,
    om.joined_at
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  JOIN organizations o ON o.id = om.organization_id
  WHERE u.auth_user_id = p_auth_uid
  AND om.role = 'partner'
  ORDER BY o.name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get partner stats (for dashboard)
CREATE OR REPLACE FUNCTION get_partner_stats(p_auth_uid UUID)
RETURNS TABLE (
  client_count BIGINT,
  library_count BIGINT,
  pending_request_count BIGINT
) AS $$
  SELECT
    (
      SELECT COUNT(*) FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = p_auth_uid
      AND om.role = 'partner'
    ) as client_count,
    (
      SELECT COUNT(*) FROM consultant_libraries cl
      JOIN users u ON u.id = cl.owner_id
      WHERE u.auth_user_id = p_auth_uid
    ) as library_count,
    (
      SELECT COUNT(*) FROM consultant_access_requests car
      JOIN users u ON u.id = car.consultant_user_id
      WHERE u.auth_user_id = p_auth_uid
      AND car.status = 'pending'
    ) as pending_request_count;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-connect a partner to an organization (with 'partner' role)
CREATE OR REPLACE FUNCTION auto_connect_partner(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Add to organization_members with partner role
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (p_user_id, p_organization_id, 'partner', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Convert standard account to partner account
CREATE OR REPLACE FUNCTION convert_to_partner_account(
  p_auth_uid UUID,
  p_agency_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  home_org_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_new_org_id UUID;
  v_slug TEXT;
BEGIN
  -- Get user id
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Check if already a partner
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND account_type = 'partner') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Already a partner account'::TEXT;
    RETURN;
  END IF;

  -- Generate slug from agency name
  v_slug := lower(regexp_replace(p_agency_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  -- Add random suffix to ensure uniqueness
  v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  -- Create new organization for the partner's agency
  INSERT INTO organizations (name, slug)
  VALUES (p_agency_name, v_slug)
  RETURNING id INTO v_new_org_id;

  -- Update user to partner account type and set home org
  UPDATE users
  SET account_type = 'partner',
      home_organization_id = v_new_org_id,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Add user as owner of their agency org
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_user_id, v_new_org_id, 'owner', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN QUERY SELECT TRUE, v_new_org_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user exists by email and return partner status
-- Drop existing function first (return type may have changed)
DROP FUNCTION IF EXISTS get_user_by_email(TEXT);
CREATE OR REPLACE FUNCTION get_user_by_email(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  auth_user_id UUID,
  user_name TEXT,
  is_consultant BOOLEAN,
  is_partner BOOLEAN,
  has_account BOOLEAN
) AS $$
  SELECT
    u.id as user_id,
    u.auth_user_id,
    u.name as user_name,
    -- Check consultant status (legacy)
    (u.role = 'consultant' OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = u.id AND om.role = 'consultant'
    )) as is_consultant,
    -- Check partner status
    (u.account_type = 'partner') as is_partner,
    TRUE as has_account
  FROM users u
  WHERE LOWER(u.email) = LOWER(p_email)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION user_is_partner TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_home_org TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_clients TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_stats TO authenticated;
GRANT EXECUTE ON FUNCTION auto_connect_partner TO authenticated;
GRANT EXECUTE ON FUNCTION convert_to_partner_account TO authenticated;

-- ============================================
-- 5. Update existing helper functions
-- ============================================

-- Update user_is_consultant to also check for partner (backward compatibility)
CREATE OR REPLACE FUNCTION user_is_consultant(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND (role = 'consultant' OR account_type = 'partner')
  ) OR EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.role IN ('consultant', 'partner')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update user_can_edit_in_org to include 'partner' role
CREATE OR REPLACE FUNCTION user_can_edit_in_org(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = p_org_id
    AND om.role IN ('owner', 'admin', 'editor', 'consultant', 'partner')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update check_user_can_edit_content to include 'partner' role
CREATE OR REPLACE FUNCTION check_user_can_edit_content(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_active_org_id UUID;
BEGIN
  -- Get user's active organization
  SELECT COALESCE(active_organization_id, organization_id) INTO v_active_org_id
  FROM users WHERE auth_user_id = p_auth_uid;

  IF v_active_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has edit permissions in the active org
  RETURN EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = v_active_org_id
    AND om.role IN ('owner', 'admin', 'editor', 'consultant', 'partner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update get_user_organizations to include partner role info
-- Drop existing function first (return type may have changed)
DROP FUNCTION IF EXISTS get_user_organizations(UUID);
CREATE OR REPLACE FUNCTION get_user_organizations(p_auth_uid UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  role TEXT,
  is_home_org BOOLEAN
) AS $$
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    om.role,
    (o.id = u.home_organization_id) as is_home_org
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  JOIN organizations o ON o.id = om.organization_id
  WHERE u.auth_user_id = p_auth_uid
  ORDER BY
    CASE WHEN o.id = u.home_organization_id THEN 0 ELSE 1 END,
    o.name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 6. Migrate existing consultants to partners
-- ============================================

-- Update users with consultant role to partner account_type
UPDATE users
SET account_type = 'partner'
WHERE role = 'consultant'
AND account_type = 'standard';

-- Update organization_members to use partner role instead of consultant
-- Only for users who are now partners
UPDATE organization_members
SET role = 'partner'
WHERE role = 'consultant'
AND user_id IN (
  SELECT id FROM users WHERE account_type = 'partner'
);

-- For partners without a home org, set their primary org as home org
UPDATE users
SET home_organization_id = organization_id
WHERE account_type = 'partner'
AND home_organization_id IS NULL
AND organization_id IS NOT NULL;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New columns:
--   - users.account_type: 'standard' | 'partner'
--   - users.home_organization_id: Partner's agency organization
--
-- New roles:
--   - 'partner': External partner role in client organizations
--
-- New functions:
--   - user_is_partner(): Check if user has partner account
--   - get_partner_home_org(): Get partner's agency org details
--   - get_partner_clients(): Get all client orgs where user is partner
--   - get_partner_stats(): Get stats for partner dashboard
--   - auto_connect_partner(): Add partner to client org
--   - convert_to_partner_account(): Convert standard to partner account
--
-- Updated functions:
--   - user_is_consultant(): Now checks for both consultant AND partner
--   - user_can_edit_in_org(): Includes partner role
--   - check_user_can_edit_content(): Includes partner role
--   - get_user_organizations(): Includes is_home_org flag
--   - get_user_by_email(): Returns is_partner field
--
-- Migration:
--   - Existing consultants migrated to account_type='partner'
--   - Consultant roles in org_members changed to 'partner'
