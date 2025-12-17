-- Migration: Add RLS policies for content tables (banners, plays, wiki_entries)
--
-- This migration adds role-based access control for content:
-- - All org members can VIEW content (SELECT)
-- - Only admins (owner/admin) can CREATE/UPDATE/DELETE content
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Enable RLS on content tables
-- ============================================

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_entries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Banners table policies
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view org banners" ON banners;
DROP POLICY IF EXISTS "Admins can create banners" ON banners;
DROP POLICY IF EXISTS "Admins can update banners" ON banners;
DROP POLICY IF EXISTS "Admins can delete banners" ON banners;
DROP POLICY IF EXISTS "Service role can manage banners" ON banners;

-- Policy 1: All org members can view banners
CREATE POLICY "Users can view org banners" ON banners
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Admins can create banners
CREATE POLICY "Admins can create banners" ON banners
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Admins can update banners
CREATE POLICY "Admins can update banners" ON banners
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 4: Admins can delete banners
CREATE POLICY "Admins can delete banners" ON banners
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 5: Service role has full access
CREATE POLICY "Service role can manage banners" ON banners
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 3. Plays table policies
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view org plays" ON plays;
DROP POLICY IF EXISTS "Admins can create plays" ON plays;
DROP POLICY IF EXISTS "Admins can update plays" ON plays;
DROP POLICY IF EXISTS "Admins can delete plays" ON plays;
DROP POLICY IF EXISTS "Service role can manage plays" ON plays;

-- Policy 1: All org members can view plays
CREATE POLICY "Users can view org plays" ON plays
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Admins can create plays
CREATE POLICY "Admins can create plays" ON plays
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Admins can update plays
CREATE POLICY "Admins can update plays" ON plays
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 4: Admins can delete plays
CREATE POLICY "Admins can delete plays" ON plays
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 5: Service role has full access
CREATE POLICY "Service role can manage plays" ON plays
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Wiki Entries table policies
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view org wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Admins can create wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Admins can update wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Admins can delete wiki entries" ON wiki_entries;
DROP POLICY IF EXISTS "Service role can manage wiki entries" ON wiki_entries;

-- Policy 1: All org members can view wiki entries
CREATE POLICY "Users can view org wiki entries" ON wiki_entries
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Admins can create wiki entries
CREATE POLICY "Admins can create wiki entries" ON wiki_entries
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Admins can update wiki entries
CREATE POLICY "Admins can update wiki entries" ON wiki_entries
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 4: Admins can delete wiki entries
CREATE POLICY "Admins can delete wiki entries" ON wiki_entries
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 5: Service role has full access
CREATE POLICY "Service role can manage wiki entries" ON wiki_entries
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Summary:
-- ============================================
-- All users in an organization can:
--   - View banners, plays, wiki_entries (SELECT)
--
-- Only owners and admins can:
--   - Create content (INSERT)
--   - Update content (UPDATE)
--   - Delete content (DELETE)
--
-- Service role has full access for backend operations.
