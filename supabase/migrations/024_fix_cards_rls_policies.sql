-- Migration 024: Fix cards table RLS policies
-- The original policies in 022 used organization_members table which doesn't match
-- the existing pattern. This migration fixes them to use the same helper functions
-- as other content tables (banners, plays, wiki_entries).

-- ============================================
-- 1. Drop existing cards policies
-- ============================================

DROP POLICY IF EXISTS "cards_select_policy" ON cards;
DROP POLICY IF EXISTS "cards_insert_policy" ON cards;
DROP POLICY IF EXISTS "cards_update_policy" ON cards;
DROP POLICY IF EXISTS "cards_delete_policy" ON cards;

-- ============================================
-- 2. Create new policies matching existing pattern
-- ============================================

-- Policy 1: All org members can view cards
CREATE POLICY "Users can view org cards" ON cards
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Editors and admins can create cards
CREATE POLICY "Editors can create cards" ON cards
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy 3: Editors and admins can update cards
CREATE POLICY "Editors can update cards" ON cards
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy 4: Editors and admins can delete cards
CREATE POLICY "Editors can delete cards" ON cards
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );

-- Policy 5: Service role has full access (for backend operations)
CREATE POLICY "Service role can manage cards" ON cards
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Summary:
-- ============================================
-- All users in an organization can:
--   - View cards (SELECT)
--
-- Owners, admins, and editors can:
--   - Create cards (INSERT)
--   - Update cards (UPDATE)
--   - Delete cards (DELETE)
--
-- This matches the pattern used by banners, plays, and wiki_entries tables.
