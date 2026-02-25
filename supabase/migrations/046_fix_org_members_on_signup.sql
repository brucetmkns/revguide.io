-- Migration: Fix create_user_with_organization to also insert into organization_members
--
-- The original function only inserts into users and organizations tables,
-- but not into organization_members. This causes getUserOrganizations() to
-- return empty, which triggers redirect loops on the admin panel because
-- handleUrlOrgSwitch() can't find the org in the empty userOrganizations array.
--
-- Also backfills any existing users who are missing organization_members records.

-- ============================================
-- 1. Update create_user_with_organization to include organization_members
-- ============================================

CREATE OR REPLACE FUNCTION create_user_with_organization(
  p_name TEXT,
  p_company_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_internal_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (p_company_name, generate_slug(p_company_name))
  RETURNING id INTO v_org_id;

  -- Create user linked to org
  INSERT INTO users (auth_user_id, name, organization_id, role, home_organization_id, active_organization_id)
  VALUES (v_user_id, p_name, v_org_id, 'admin', v_org_id, v_org_id)
  RETURNING id INTO v_internal_user_id;

  -- Add to organization_members (required for getUserOrganizations)
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_internal_user_id, v_org_id, 'admin', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN json_build_object('success', true, 'organization_id', v_org_id);
END;
$$;

-- ============================================
-- 2. Backfill missing organization_members for existing users
-- ============================================

-- Find users who have an organization_id but no corresponding organization_members record
INSERT INTO organization_members (user_id, organization_id, role, joined_at)
SELECT u.id, u.organization_id, u.role, COALESCE(u.created_at, NOW())
FROM users u
WHERE u.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = u.id
      AND om.organization_id = u.organization_id
  )
ON CONFLICT (user_id, organization_id) DO NOTHING;
