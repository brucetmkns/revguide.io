-- Migration: Rename Consultant to Partner
--
-- This migration completes the transition from "consultant" terminology to "partner":
-- 1. Rename tables: consultant_libraries -> partner_libraries, consultant_access_requests -> partner_access_requests
-- 2. Rename columns: consultant_user_id -> partner_user_id, consultant_name -> partner_name, consultant_email -> partner_email
-- 3. Update role values: 'consultant' -> 'partner' in organization_members and invitations
-- 4. Create new function names and drop old ones
-- 5. Update constraints
--
-- Note: Migration 021 already added 'partner' role alongside 'consultant' for backward compatibility.
-- This migration completes the rename and removes 'consultant' references.

-- ============================================
-- 1. Rename Tables
-- ============================================

-- Rename consultant_libraries to partner_libraries
ALTER TABLE IF EXISTS consultant_libraries RENAME TO partner_libraries;

-- Rename consultant_access_requests to partner_access_requests
ALTER TABLE IF EXISTS consultant_access_requests RENAME TO partner_access_requests;

-- ============================================
-- 2. Rename Columns in partner_access_requests
-- ============================================

-- Rename consultant_user_id to partner_user_id
ALTER TABLE partner_access_requests RENAME COLUMN consultant_user_id TO partner_user_id;

-- ============================================
-- 3. Drop constraints FIRST (before updating data)
-- ============================================

-- Drop users role constraint (must happen before UPDATE)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Drop organization_members role constraint
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;

-- Drop invitations role constraint
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;

-- Drop invitations invitation_type constraint
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invitation_type_check;

-- ============================================
-- 4. Migrate role values from 'consultant' to 'partner'
-- ============================================

-- Update any remaining 'consultant' roles in users table to 'partner'
UPDATE users SET role = 'partner' WHERE role = 'consultant';

-- Update any remaining 'consultant' roles in organization_members to 'partner'
UPDATE organization_members SET role = 'partner' WHERE role = 'consultant';

-- Update any remaining 'consultant' roles in invitations to 'partner'
UPDATE invitations SET role = 'partner' WHERE role = 'consultant';

-- Update any remaining 'consultant' invitation_type to 'partner'
UPDATE invitations SET invitation_type = 'partner' WHERE invitation_type = 'consultant';

-- ============================================
-- 5. Recreate constraints with updated values
-- ============================================

-- Recreate users role constraint (with partner, without consultant)
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member', 'partner'));

-- Recreate organization_members role constraint
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'partner'));

-- Recreate invitations role constraint
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member', 'partner'));

-- Recreate invitations invitation_type constraint
ALTER TABLE invitations ADD CONSTRAINT invitations_invitation_type_check
  CHECK (invitation_type IN ('team', 'partner'));

-- ============================================
-- 5. Create renamed functions (partner versions)
-- ============================================

-- auto_connect_partner already exists from migration 021
-- user_is_partner already exists from migration 021

-- Rename/recreate get_consultant_access_requests -> get_partner_access_requests
DROP FUNCTION IF EXISTS get_consultant_access_requests(UUID);
CREATE OR REPLACE FUNCTION get_partner_access_requests(p_auth_uid UUID)
RETURNS TABLE (
  request_id UUID,
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  status TEXT,
  message TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
) AS $$
  SELECT
    par.id as request_id,
    par.organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    par.status,
    par.message,
    par.requested_at,
    par.reviewed_at
  FROM partner_access_requests par
  JOIN users u ON u.id = par.partner_user_id
  JOIN organizations o ON o.id = par.organization_id
  WHERE u.auth_user_id = p_auth_uid
  ORDER BY par.requested_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Rename/recreate search_organizations_for_consultant -> search_organizations_for_partner
DROP FUNCTION IF EXISTS search_organizations_for_consultant(UUID, TEXT);
CREATE OR REPLACE FUNCTION search_organizations_for_partner(p_auth_uid UUID, p_query TEXT)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  already_member BOOLEAN,
  pending_request BOOLEAN
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user id
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = p_auth_uid;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = o.id AND om.user_id = v_user_id
    ) as already_member,
    EXISTS (
      SELECT 1 FROM partner_access_requests par
      WHERE par.organization_id = o.id
      AND par.partner_user_id = v_user_id
      AND par.status = 'pending'
    ) as pending_request
  FROM organizations o
  WHERE
    o.name ILIKE '%' || p_query || '%'
    OR o.hubspot_portal_id ILIKE '%' || p_query || '%'
  ORDER BY o.name
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Rename/recreate get_org_access_requests to use partner terminology in output
DROP FUNCTION IF EXISTS get_org_access_requests(UUID);
CREATE OR REPLACE FUNCTION get_org_access_requests(p_org_id UUID)
RETURNS TABLE (
  request_id UUID,
  partner_id UUID,
  partner_name TEXT,
  partner_email TEXT,
  message TEXT,
  status TEXT,
  requested_at TIMESTAMPTZ
) AS $$
  SELECT
    par.id as request_id,
    par.partner_user_id as partner_id,
    u.name as partner_name,
    u.email as partner_email,
    par.message,
    par.status,
    par.requested_at
  FROM partner_access_requests par
  JOIN users u ON u.id = par.partner_user_id
  WHERE par.organization_id = p_org_id
  ORDER BY par.requested_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update user_is_consultant to just check for partner (remove consultant check)
-- Keep function name for now for backward compatibility in code, but update logic
CREATE OR REPLACE FUNCTION user_is_consultant(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND account_type = 'partner'
  ) OR EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.role = 'partner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update auto_connect_consultant to use partner role
-- Keep function name for backward compatibility in code
CREATE OR REPLACE FUNCTION auto_connect_consultant(
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

-- Update get_user_by_email to rename is_consultant to is_partner
DROP FUNCTION IF EXISTS get_user_by_email(TEXT);
CREATE OR REPLACE FUNCTION get_user_by_email(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  auth_user_id UUID,
  user_name TEXT,
  is_consultant BOOLEAN,  -- Keep for backward compatibility, but check partner
  is_partner BOOLEAN,
  has_account BOOLEAN
) AS $$
  SELECT
    u.id as user_id,
    u.auth_user_id,
    u.name as user_name,
    -- is_consultant now just checks partner status (for backward compat)
    (u.account_type = 'partner' OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = u.id AND om.role = 'partner'
    )) as is_consultant,
    -- is_partner check
    (u.account_type = 'partner') as is_partner,
    TRUE as has_account
  FROM users u
  WHERE LOWER(u.email) = LOWER(p_email)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update approve_access_request to use partner table
DROP FUNCTION IF EXISTS approve_access_request(UUID, UUID);
CREATE OR REPLACE FUNCTION approve_access_request(
  p_request_id UUID,
  p_reviewer_auth_uid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_reviewer_id UUID;
  v_partner_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Get reviewer user id
  SELECT id INTO v_reviewer_id FROM users WHERE auth_user_id = p_reviewer_auth_uid;
  IF v_reviewer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get request details
  SELECT partner_user_id, organization_id INTO v_partner_user_id, v_org_id
  FROM partner_access_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_partner_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update request status
  UPDATE partner_access_requests
  SET status = 'approved',
      reviewed_by = v_reviewer_id,
      reviewed_at = NOW()
  WHERE id = p_request_id;

  -- Add partner to organization
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_partner_user_id, v_org_id, 'partner', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update decline_access_request to use partner table
DROP FUNCTION IF EXISTS decline_access_request(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION decline_access_request(
  p_request_id UUID,
  p_reviewer_auth_uid UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_reviewer_id UUID;
BEGIN
  -- Get reviewer user id
  SELECT id INTO v_reviewer_id FROM users WHERE auth_user_id = p_reviewer_auth_uid;
  IF v_reviewer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update request status
  UPDATE partner_access_requests
  SET status = 'declined',
      reviewed_by = v_reviewer_id,
      reviewed_at = NOW(),
      review_notes = p_notes
  WHERE id = p_request_id AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_partner_stats to use renamed table
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
      SELECT COUNT(*) FROM partner_libraries pl
      JOIN users u ON u.id = pl.owner_id
      WHERE u.auth_user_id = p_auth_uid
    ) as library_count,
    (
      SELECT COUNT(*) FROM partner_access_requests par
      JOIN users u ON u.id = par.partner_user_id
      WHERE u.auth_user_id = p_auth_uid
      AND par.status = 'pending'
    ) as pending_request_count;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 6. Update RLS Policies for renamed tables
-- ============================================

-- Drop old policies on renamed tables (they reference old table names internally)
DROP POLICY IF EXISTS "Users can view their own libraries" ON partner_libraries;
DROP POLICY IF EXISTS "Users can manage their own libraries" ON partner_libraries;
DROP POLICY IF EXISTS "Partners can view their own requests" ON partner_access_requests;
DROP POLICY IF EXISTS "Partners can create requests" ON partner_access_requests;
DROP POLICY IF EXISTS "Admins can view org requests" ON partner_access_requests;

-- Recreate policies for partner_libraries
CREATE POLICY "Users can view their own libraries" ON partner_libraries
  FOR SELECT USING (
    owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can manage their own libraries" ON partner_libraries
  FOR ALL USING (
    owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Recreate policies for partner_access_requests
CREATE POLICY "Partners can view their own requests" ON partner_access_requests
  FOR SELECT USING (
    partner_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Partners can create requests" ON partner_access_requests
  FOR INSERT WITH CHECK (
    partner_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Admins can view org requests" ON partner_access_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 7. Update library_installations foreign key
-- ============================================

-- The foreign key to consultant_libraries needs to point to partner_libraries
-- PostgreSQL automatically updates FK references when table is renamed

-- ============================================
-- 8. Grant permissions on new functions
-- ============================================

GRANT EXECUTE ON FUNCTION get_partner_access_requests TO authenticated;
GRANT EXECUTE ON FUNCTION search_organizations_for_partner TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_access_requests TO authenticated;
GRANT EXECUTE ON FUNCTION approve_access_request TO authenticated;
GRANT EXECUTE ON FUNCTION decline_access_request TO authenticated;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- Tables renamed:
--   - consultant_libraries -> partner_libraries
--   - consultant_access_requests -> partner_access_requests
--
-- Columns renamed:
--   - consultant_user_id -> partner_user_id (in partner_access_requests)
--
-- Role values migrated:
--   - All 'consultant' roles -> 'partner' in organization_members, invitations, users
--
-- Constraints updated:
--   - Removed 'consultant' from allowed role values
--
-- Functions updated/renamed:
--   - get_consultant_access_requests -> get_partner_access_requests
--   - search_organizations_for_consultant -> search_organizations_for_partner
--   - get_org_access_requests output columns renamed (consultant_* -> partner_*)
--   - user_is_consultant now checks for 'partner' role only
--   - auto_connect_consultant uses 'partner' role
--   - approve_access_request uses partner_access_requests table
--   - decline_access_request uses partner_access_requests table
--   - get_partner_stats uses partner_libraries table
--
-- RLS policies recreated for renamed tables
