-- Migration 019: Fix infinite recursion in organization_members RLS policy
--
-- Problem: The "Users can view org memberships" policy references organization_members
-- in its own USING clause, causing infinite recursion.
--
-- Solution: Use SECURITY DEFINER functions to break the recursion cycle.

-- First, create a helper function to get user's org memberships (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_org_ids(p_auth_uid UUID)
RETURNS SETOF UUID AS $$
  SELECT om.organization_id
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  WHERE u.auth_user_id = p_auth_uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_org_ids TO authenticated;

-- Get user's internal ID from auth ID (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_id TO authenticated;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view org memberships" ON organization_members;
DROP POLICY IF EXISTS "Admins can manage org memberships" ON organization_members;

-- Recreate policies using SECURITY DEFINER functions
-- Users can see their own memberships OR memberships for orgs they belong to
CREATE POLICY "Users can view org memberships" ON organization_members
  FOR SELECT USING (
    user_id = get_user_id(auth.uid())
    OR organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Create helper to check if user is admin of a specific org (bypasses RLS)
CREATE OR REPLACE FUNCTION user_is_org_admin(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN organization_members om ON om.user_id = u.id AND om.organization_id = p_org_id
    WHERE u.auth_user_id = p_auth_uid
    AND (
      -- Admin of primary org
      (u.organization_id = p_org_id AND u.role IN ('owner', 'admin'))
      -- OR admin via membership
      OR om.role IN ('owner', 'admin', 'consultant')
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION user_is_org_admin TO authenticated;

-- Admins/owners can manage memberships for their orgs
CREATE POLICY "Admins can manage org memberships" ON organization_members
  FOR ALL USING (
    user_is_org_admin(auth.uid(), organization_id)
  );
