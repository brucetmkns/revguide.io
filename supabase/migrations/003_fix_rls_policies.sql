-- Migration: Fix RLS Policies to Avoid Circular Dependencies
-- Run this in Supabase SQL Editor
--
-- Problem: The users table policy queries itself to check organization_id,
-- which combined with the organizations policy creates a circular dependency
-- causing 500 errors on joined queries.
--
-- Solution: Use auth.uid() directly where possible, and use SECURITY DEFINER
-- functions for cross-table lookups.

-- ============================================
-- 1. Re-enable RLS (if disabled for debugging)
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Create helper function to get user's org
-- ============================================

-- This function runs with elevated privileges (SECURITY DEFINER)
-- so it bypasses RLS and avoids circular dependencies
CREATE OR REPLACE FUNCTION get_user_organization_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_organization_id TO authenticated;

-- ============================================
-- 3. Fix Users table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view org members" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;

-- Policy 1: Users can always view their own record (no subquery needed)
CREATE POLICY "Users can view own record" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Policy 2: Users can view other members in same org (uses helper function)
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- Policy 4: Users can insert their own record (for new signups)
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- Policy 5: Service role has full access
CREATE POLICY "Service role can manage users" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Fix Organizations table policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own organization" ON organizations;
DROP POLICY IF EXISTS "Owners can update organization" ON organizations;
DROP POLICY IF EXISTS "Service role can manage organizations" ON organizations;

-- Policy 1: Users can view their organization (uses helper function)
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Admins/Owners can update their organization
CREATE POLICY "Owners can update organization" ON organizations
  FOR UPDATE USING (
    id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Service role has full access
CREATE POLICY "Service role can manage organizations" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 5. Fix HubSpot Connections policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view org connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON hubspot_connections;
DROP POLICY IF EXISTS "Service role can manage all connections" ON hubspot_connections;

-- Policy 1: Users can view their org's connections
CREATE POLICY "Users can view org connections" ON hubspot_connections
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );

-- Policy 2: Admins can manage connections
CREATE POLICY "Admins can manage connections" ON hubspot_connections
  FOR ALL USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 3: Service role has full access
CREATE POLICY "Service role can manage all connections" ON hubspot_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 6. Fix Invitations policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Users can view own invitation" ON invitations;

-- Policy 1: Admins can manage their org's invitations
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL USING (
    organization_id = get_user_organization_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy 2: Anyone can view invitations sent to their email
CREATE POLICY "Users can view own invitation" ON invitations
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Policy 3: Service role has full access
DROP POLICY IF EXISTS "Service role can manage invitations" ON invitations;
CREATE POLICY "Service role can manage invitations" ON invitations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. Verify policies are working
-- ============================================

-- Run these queries to verify (as an authenticated user):
-- SELECT * FROM users WHERE auth_user_id = auth.uid();
-- SELECT * FROM organizations;
-- SELECT * FROM users;
-- SELECT u.*, o.name as org_name FROM users u LEFT JOIN organizations o ON u.organization_id = o.id;
