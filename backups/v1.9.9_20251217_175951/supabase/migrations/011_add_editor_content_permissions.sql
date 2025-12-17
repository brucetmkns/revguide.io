-- Migration: Add editor role to content RLS policies
--
-- The current RLS policies only allow 'owner' and 'admin' roles to create/edit/delete content.
-- This migration updates them to also include the 'editor' role.
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Update check_user_is_admin to check for editor too
-- ============================================

-- Create a new function that checks for content editing permissions
CREATE OR REPLACE FUNCTION check_user_can_edit_content(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_user_can_edit_content TO authenticated;

-- ============================================
-- 2. Update Banners table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create banners" ON banners;
DROP POLICY IF EXISTS "Admins can update banners" ON banners;
DROP POLICY IF EXISTS "Admins can delete banners" ON banners;

-- Policy: Editors and admins can create banners
CREATE POLICY "Editors can create banners" ON banners
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can update banners
CREATE POLICY "Editors can update banners" ON banners
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can delete banners
CREATE POLICY "Editors can delete banners" ON banners
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- ============================================
-- 3. Update Plays table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create plays" ON plays;
DROP POLICY IF EXISTS "Admins can update plays" ON plays;
DROP POLICY IF EXISTS "Admins can delete plays" ON plays;

-- Policy: Editors and admins can create plays
CREATE POLICY "Editors can create plays" ON plays
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can update plays
CREATE POLICY "Editors can update plays" ON plays
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can delete plays
CREATE POLICY "Editors can delete plays" ON plays
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- ============================================
-- 4. Update Wiki Entries table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can create wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Admins can update wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Admins can delete wiki entries" ON wiki_entries;

-- Policy: Editors and admins can create wiki entries
CREATE POLICY "Editors can create wiki entries" ON wiki_entries
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can update wiki entries
CREATE POLICY "Editors can update wiki entries" ON wiki_entries
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy: Editors and admins can delete wiki entries
CREATE POLICY "Editors can delete wiki entries" ON wiki_entries
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- ============================================
-- Summary:
-- ============================================
-- All users in an organization can:
--   - View banners, plays, wiki_entries (SELECT) - unchanged
--
-- Owners, admins, AND editors can now:
--   - Create content (INSERT)
--   - Update content (UPDATE)
--   - Delete content (DELETE)
--
-- Viewers can only view content (SELECT)
