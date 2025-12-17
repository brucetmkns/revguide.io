-- Migration: Fix Invitation RLS Permission Error
-- Run this in Supabase SQL Editor
--
-- Problem: "permission denied for table users" when creating invitations
-- The invitations policy checks admin status via a subquery on users table,
-- but users table RLS blocks the subquery.
--
-- Solution: Ensure SECURITY DEFINER functions exist and use them in policies.

-- ============================================
-- 1. Ensure helper functions exist
-- ============================================

-- Get user's organization ID (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_organization_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is admin/owner (bypasses RLS)
CREATE OR REPLACE FUNCTION check_user_is_admin(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organization_id TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_is_admin TO authenticated;

-- ============================================
-- 2. Fix Users table policies
-- ============================================

-- Drop all existing user policies to start fresh
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_service_role" ON users;
DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Users can view org members" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;
DROP POLICY IF EXISTS "Service role full access users" ON users;

-- Users can view their own record
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Users can update their own record
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Users can insert their own record (signup)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- Service role bypasses RLS
CREATE POLICY "users_service_role" ON users
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. Fix Invitations table policies
-- ============================================

-- Drop existing invitation policies
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Users can view own invitation" ON invitations;
DROP POLICY IF EXISTS "Service role can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Service role full access invitations" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_all" ON invitations;
DROP POLICY IF EXISTS "invitations_view_own_email" ON invitations;
DROP POLICY IF EXISTS "invitations_service_role" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_select" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_insert" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_update" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_delete" ON invitations;

-- Admins can SELECT invitations for their org
CREATE POLICY "invitations_admin_select" ON invitations
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can INSERT invitations for their org
CREATE POLICY "invitations_admin_insert" ON invitations
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can UPDATE invitations for their org
CREATE POLICY "invitations_admin_update" ON invitations
  FOR UPDATE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can DELETE invitations for their org
CREATE POLICY "invitations_admin_delete" ON invitations
  FOR DELETE USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Anyone can view invitations sent to their email (for accepting)
CREATE POLICY "invitations_view_own_email" ON invitations
  FOR SELECT USING (
    email = auth.jwt()->>'email'
  );

-- Service role has full access
CREATE POLICY "invitations_service_role" ON invitations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. Ensure RLS is enabled
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Grant table permissions to authenticated role
-- ============================================
-- RLS policies control row-level access, but users also need
-- basic table-level permissions to query at all.

GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO authenticated;

-- ============================================
-- 6. Verify (run manually)
-- ============================================
-- SELECT check_user_is_admin(auth.uid());
-- SELECT get_user_organization_id(auth.uid());
-- INSERT INTO invitations (organization_id, email, role)
--   VALUES (get_user_organization_id(auth.uid()), 'test@example.com', 'member');
