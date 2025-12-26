-- Migration: Allow partners to create/edit/delete content in managed organizations
--
-- PROBLEM: Partners get RLS error when creating content in managed accounts.
-- The existing check_user_can_edit_content() function may be outdated or
-- not include 'partner' in the role check.
--
-- This migration:
-- 1. Updates check_user_can_edit_content to include 'partner' role
-- 2. Creates a new function that checks edit permissions for a specific org
-- 3. Updates RLS policies to use the new function
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Fix check_user_can_edit_content to include 'partner' role
-- ============================================

-- This replaces the function to ensure 'partner' is in the role list
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

  -- Check if user has edit permissions in the active org via organization_members
  RETURN EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = v_active_org_id
    AND om.role IN ('owner', 'admin', 'editor', 'partner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- 2. Create helper function to check if user can edit content in a SPECIFIC org
-- ============================================

CREATE OR REPLACE FUNCTION check_user_can_edit_org_content(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_can_edit BOOLEAN := FALSE;
BEGIN
  -- Get the user's internal ID
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = p_auth_uid;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check 1: Is user a direct member of this org with edit permissions?
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND organization_id = p_org_id
    AND role IN ('owner', 'admin', 'editor')
  ) INTO v_can_edit;

  IF v_can_edit THEN
    RETURN TRUE;
  END IF;

  -- Check 2: Is user in organization_members with edit permissions (owner/admin/editor/partner)?
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = p_org_id
    AND role IN ('owner', 'admin', 'editor', 'partner')
  ) INTO v_can_edit;

  RETURN v_can_edit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_user_can_edit_org_content TO authenticated;

-- ============================================
-- 2. Update Banners table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Editors can create banners" ON banners;
DROP POLICY IF EXISTS "Editors can update banners" ON banners;
DROP POLICY IF EXISTS "Editors can delete banners" ON banners;
DROP POLICY IF EXISTS "Users can view org banners" ON banners;

-- Policy: Users can view banners for their org OR orgs they're a partner of
CREATE POLICY "Users can view org banners" ON banners
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create banners
CREATE POLICY "Editors can create banners" ON banners
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update banners
CREATE POLICY "Editors can update banners" ON banners
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete banners
CREATE POLICY "Editors can delete banners" ON banners
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- ============================================
-- 3. Update Plays table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Editors can create plays" ON plays;
DROP POLICY IF EXISTS "Editors can update plays" ON plays;
DROP POLICY IF EXISTS "Editors can delete plays" ON plays;
DROP POLICY IF EXISTS "Users can view org plays" ON plays;

-- Policy: Users can view plays for their org OR orgs they're a partner of
CREATE POLICY "Users can view org plays" ON plays
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create plays
CREATE POLICY "Editors can create plays" ON plays
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update plays
CREATE POLICY "Editors can update plays" ON plays
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete plays
CREATE POLICY "Editors can delete plays" ON plays
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- ============================================
-- 4. Update Wiki Entries table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Editors can create wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Editors can update wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Editors can delete wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Users can view org wiki entries" ON wiki_entries;

-- Policy: Users can view wiki entries for their org OR orgs they're a partner of
CREATE POLICY "Users can view org wiki entries" ON wiki_entries
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create wiki entries
CREATE POLICY "Editors can create wiki entries" ON wiki_entries
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update wiki entries
CREATE POLICY "Editors can update wiki entries" ON wiki_entries
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete wiki entries
CREATE POLICY "Editors can delete wiki entries" ON wiki_entries
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- ============================================
-- Summary:
-- ============================================
-- Content can now be created/edited/deleted by:
--   1. Direct org members with role: owner, admin, editor
--   2. Partners (via organization_members with role='partner')
--
-- Content can be viewed by:
--   1. All direct org members (any role)
--   2. Partners for that org
