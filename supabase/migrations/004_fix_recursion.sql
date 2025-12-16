-- Migration: Fix Infinite Recursion in RLS Policies
-- Run this in Supabase SQL Editor
--
-- Problem: The "Owners can update organization" policy uses a subquery
-- that checks the users table, which triggers RLS on users, which
-- uses get_user_organization_id(), which queries users again = recursion.
--
-- Solution: Create SECURITY DEFINER functions for role checks that bypass RLS.

-- ============================================
-- 1. Create helper function to check user role
-- ============================================

-- This function runs with elevated privileges (SECURITY DEFINER)
-- so it bypasses RLS and avoids circular dependencies
CREATE OR REPLACE FUNCTION check_user_is_admin(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_user_is_admin TO authenticated;

-- ============================================
-- 2. Fix Users table policies
-- ============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Users can view org members" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;

-- Simple policy: Users can view and update their own record only
-- No cross-table lookups needed
CREATE POLICY "Users can view own record" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access users" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 3. Fix Organizations table policies
-- ============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view own organization" ON organizations;
DROP POLICY IF EXISTS "Owners can update organization" ON organizations;
DROP POLICY IF EXISTS "Service role can manage organizations" ON organizations;

-- Users can view their organization (uses SECURITY DEFINER function)
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id = get_user_organization_id(auth.uid())
  );

-- Users can update their organization (uses SECURITY DEFINER functions)
-- No subquery, just function calls
CREATE POLICY "Users can update own organization" ON organizations
  FOR UPDATE USING (
    id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  )
  WITH CHECK (
    id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Service role has full access
CREATE POLICY "Service role full access orgs" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Fix HubSpot Connections policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view org connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Service role can manage all connections" ON hubspot_connections;

-- Users can view their org's connections
CREATE POLICY "Users can view org connections" ON hubspot_connections
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Admins can manage connections (using SECURITY DEFINER function)
CREATE POLICY "Admins can manage connections" ON hubspot_connections
  FOR ALL USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Service role has full access
CREATE POLICY "Service role full access connections" ON hubspot_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 5. Fix Invitations policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Users can view own invitation" ON invitations;
DROP POLICY IF EXISTS "Service role can manage invitations" ON invitations;

-- Admins can manage their org's invitations
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Anyone can view invitations sent to their email
CREATE POLICY "Users can view own invitation" ON invitations
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Service role has full access
CREATE POLICY "Service role full access invitations" ON invitations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 6. Verify the fix
-- ============================================
-- Test by running these in the SQL Editor as yourself:
--
-- -- This should work without recursion error:
-- UPDATE users SET name = 'Test Name' WHERE auth_user_id = auth.uid();
--
-- -- This should work for admins:
-- UPDATE organizations SET name = 'Test Org' WHERE id = get_user_organization_id(auth.uid());
