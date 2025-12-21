-- Migration 022: Fix users table visibility for organization members
--
-- Problem: The users table RLS policy only allows viewing your own record.
-- When admins query organization_members with a join to users, they can't
-- see partner user records because RLS blocks access.
--
-- Solution: Add a policy to allow viewing users who are in the same organization,
-- either as regular members (via users.organization_id) or as partners
-- (via organization_members table).

-- Create a helper function to check if user can view another user (bypasses RLS)
CREATE OR REPLACE FUNCTION can_view_user(p_viewer_auth_uid UUID, p_target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_viewer_org_id UUID;
BEGIN
  -- Get viewer's active organization
  SELECT COALESCE(active_organization_id, organization_id) INTO v_viewer_org_id
  FROM users WHERE auth_user_id = p_viewer_auth_uid;

  IF v_viewer_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if target user is in the same organization
  -- Either as a direct member (organization_id matches)
  -- Or as a partner (via organization_members)
  RETURN EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_target_user_id
    AND (
      u.organization_id = v_viewer_org_id
      OR EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = u.id
        AND om.organization_id = v_viewer_org_id
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION can_view_user TO authenticated;

-- Add policy to allow viewing users in your organization
CREATE POLICY "users_select_org_members" ON users
  FOR SELECT USING (
    -- Can always view your own record
    auth_user_id = auth.uid()
    -- Or can view users in your organization
    OR can_view_user(auth.uid(), id)
  );

-- Drop the old policy that only allowed viewing own record
DROP POLICY IF EXISTS "users_select_own" ON users;

-- Summary:
-- - Added can_view_user() helper function
-- - New policy allows viewing:
--   1. Your own user record
--   2. Users who are members of your active organization
--   3. Partners who have access to your organization
