-- Migration: Fix HubSpot Connection Permissions for Partners
--
-- Problem: Partners cannot save HubSpot connections for client organizations because:
-- 1. RLS policy only allows 'owner' and 'admin' roles
-- 2. The org context uses organization_id instead of active_organization_id
--
-- Solution:
-- 1. Create function to check if user can manage HubSpot for a specific org
-- 2. Create function to get user's effective organization (active or primary)
-- 3. Update RLS policies to allow partners

-- ============================================
-- 1. Helper function: Get user's effective organization
-- ============================================

-- Returns the user's active_organization_id if set, otherwise organization_id
CREATE OR REPLACE FUNCTION get_user_effective_org(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT COALESCE(active_organization_id, organization_id)
  FROM users
  WHERE auth_user_id = p_auth_uid
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_effective_org TO authenticated;

-- ============================================
-- 2. Helper function: Check if user can manage HubSpot for an org
-- ============================================

-- Returns true if user is owner/admin in their primary org, OR a partner in the specified org
CREATE OR REPLACE FUNCTION check_user_can_manage_hubspot(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user's internal ID
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user is owner/admin in their primary org AND it matches the target org
  IF EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin')
    AND organization_id = p_org_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if user is a partner in the target org via organization_members
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = p_org_id
    AND role = 'partner'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION check_user_can_manage_hubspot TO authenticated;

-- ============================================
-- 3. Update HubSpot Connections RLS policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view org connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Service role full access connections" ON hubspot_connections;

-- Users can view connections for their effective org (includes partners viewing client orgs)
CREATE POLICY "Users can view org connections" ON hubspot_connections
  FOR SELECT USING (
    organization_id = get_user_effective_org(auth.uid())
    OR check_user_can_manage_hubspot(auth.uid(), organization_id)
  );

-- Users who can manage HubSpot (admins in their org OR partners in client org) can modify connections
CREATE POLICY "Managers can manage connections" ON hubspot_connections
  FOR ALL USING (
    check_user_can_manage_hubspot(auth.uid(), organization_id)
  );

-- Service role has full access
CREATE POLICY "Service role full access connections" ON hubspot_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Update Organizations RLS to allow partners to update hubspot fields
-- ============================================

-- Partners need to be able to update hubspot_portal_id and hubspot_portal_domain on client orgs
-- Check if there's an existing policy that restricts this

-- Create or replace function to check if user can update org's HubSpot config
CREATE OR REPLACE FUNCTION check_user_can_update_org_hubspot(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owner or admin of the org
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = p_org_id
    AND role IN ('owner', 'admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- Partner of the org
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = p_org_id
    AND role = 'partner'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION check_user_can_update_org_hubspot TO authenticated;

-- ============================================
-- Summary
-- ============================================
--
-- New functions:
--   - get_user_effective_org(): Returns active_organization_id or organization_id
--   - check_user_can_manage_hubspot(): Returns true for admins or partners
--   - check_user_can_update_org_hubspot(): Returns true for admins or partners
--
-- Updated policies:
--   - "Users can view org connections": Now checks effective org + partner access
--   - "Managers can manage connections": Replaces admin-only policy, allows partners
