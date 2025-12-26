-- Migration: Fix organizations RLS for portal matching
--
-- PROBLEM: When querying organizations by hubspot_portal_id, we get:
-- "permission denied for table users"
--
-- This happens because the RLS policy on organizations uses get_user_org_ids()
-- which joins organization_members with users. The SECURITY DEFINER function
-- needs explicit permission to access these tables.
--
-- SOLUTION: Ensure the functions have proper table access grants

-- ============================================
-- 1. Grant table access to functions
-- ============================================

-- The SECURITY DEFINER functions run as the function owner (usually postgres)
-- They should already have access, but let's ensure authenticated users
-- can call them properly

-- Ensure get_user_org_ids can access the tables it needs
DROP FUNCTION IF EXISTS get_user_org_ids(UUID);
CREATE OR REPLACE FUNCTION get_user_org_ids(p_auth_uid UUID)
RETURNS SETOF UUID AS $$
  SELECT om.organization_id
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  WHERE u.auth_user_id = p_auth_uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_org_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_org_ids(UUID) TO anon;

-- ============================================
-- 2. Add policy to allow viewing orgs by portal_id for authenticated users who are partners
-- ============================================

-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Partners can view client orgs by portal" ON organizations;

-- Partners can view organizations where they have partner role
CREATE POLICY "Partners can view client orgs by portal" ON organizations
  FOR SELECT TO authenticated
  USING (
    -- User is a partner for this org
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = organizations.id
      AND om.role = 'partner'
    )
  );

-- ============================================
-- 3. Also allow viewing by portal ID for authenticated users
-- ============================================

-- This allows the portal matching to work - if user has ANY access to an org,
-- they should be able to find it by portal ID

DROP POLICY IF EXISTS "Users can view orgs they have access to" ON organizations;

CREATE POLICY "Users can view orgs they have access to" ON organizations
  FOR SELECT TO authenticated
  USING (
    -- User is direct member
    id IN (
      SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
      UNION
      SELECT active_organization_id FROM users WHERE auth_user_id = auth.uid() AND active_organization_id IS NOT NULL
    )
    OR
    -- User is in organization_members for this org
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = organizations.id
    )
  );

-- ============================================
-- Summary:
-- ============================================
-- 1. Recreated get_user_org_ids with SECURITY DEFINER
-- 2. Added policy for partners to view client orgs
-- 3. Added unified policy for viewing orgs user has access to
