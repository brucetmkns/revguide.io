-- Migration: Add HubSpot/Nango connection support
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Add columns to organizations table
-- ============================================

-- Check if organizations table exists, if not create it
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add HubSpot-related columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hubspot_portal_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hubspot_portal_domain TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nango_connection_id TEXT;

-- Create unique index on portal_id (allows NULL values but unique non-NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_portal_id
  ON organizations(hubspot_portal_id)
  WHERE hubspot_portal_id IS NOT NULL;

-- ============================================
-- 2. Update users table
-- ============================================

-- Check if users table exists, if not create it
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Nango user ID for tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS nango_user_id TEXT;

-- Create index on auth_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- 3. Create hubspot_connections table
-- ============================================

-- For multi-portal support (agencies managing multiple HubSpot portals)
CREATE TABLE IF NOT EXISTS hubspot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  portal_id TEXT NOT NULL,
  portal_domain TEXT,
  portal_name TEXT,
  nango_connection_id TEXT NOT NULL,
  connected_by UUID REFERENCES users(id),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  scopes TEXT[], -- Store granted scopes
  metadata JSONB DEFAULT '{}',
  UNIQUE(organization_id, portal_id)
);

-- Index for finding orgs by portal
CREATE INDEX IF NOT EXISTS idx_hubspot_connections_portal
  ON hubspot_connections(portal_id);

-- ============================================
-- 4. Create invitations table (for join org flow)
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES users(id),
  token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- ============================================
-- 5. Row Level Security Policies
-- ============================================

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubspot_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can see their own org
DROP POLICY IF EXISTS "Users can view own organization" ON organizations;
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Organizations: Owners can update their org
DROP POLICY IF EXISTS "Owners can update organization" ON organizations;
CREATE POLICY "Owners can update organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Users: Can see users in same org
DROP POLICY IF EXISTS "Users can view org members" ON users;
CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
    )
    OR auth_user_id = auth.uid() -- Can always see self
  );

-- Users: Can update own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- HubSpot Connections: Users can see their org's connections
DROP POLICY IF EXISTS "Users can view org connections" ON hubspot_connections;
CREATE POLICY "Users can view org connections" ON hubspot_connections
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- HubSpot Connections: Admins can manage connections
DROP POLICY IF EXISTS "Admins can manage connections" ON hubspot_connections;
CREATE POLICY "Admins can manage connections" ON hubspot_connections
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations: Admins can manage invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Invitations: Anyone can view their own invitation
DROP POLICY IF EXISTS "Users can view own invitation" ON invitations;
CREATE POLICY "Users can view own invitation" ON invitations
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- ============================================
-- 6. Service role policies (for edge functions)
-- ============================================

-- Allow service role to insert organizations (for OAuth callback)
DROP POLICY IF EXISTS "Service role can manage organizations" ON organizations;
CREATE POLICY "Service role can manage organizations" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

-- Allow service role to manage users
DROP POLICY IF EXISTS "Service role can manage users" ON users;
CREATE POLICY "Service role can manage users" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- Allow service role to manage connections
DROP POLICY IF EXISTS "Service role can manage all connections" ON hubspot_connections;
CREATE POLICY "Service role can manage all connections" ON hubspot_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. OAuth completion tracking (for frontend polling)
-- ============================================

CREATE TABLE IF NOT EXISTS oauth_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT UNIQUE NOT NULL,
  portal_id TEXT,
  portal_name TEXT,
  organization_id UUID REFERENCES organizations(id),
  organization_name TEXT,
  is_new_org BOOLEAN DEFAULT FALSE,
  existing_org_found BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES users(id),
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_oauth_completions_connection
  ON oauth_completions(connection_id);

-- Clean up old records automatically (optional - run via cron)
-- DELETE FROM oauth_completions WHERE expires_at < NOW();

-- RLS for oauth_completions
ALTER TABLE oauth_completions ENABLE ROW LEVEL SECURITY;

-- Service role can manage
DROP POLICY IF EXISTS "Service role manages oauth_completions" ON oauth_completions;
CREATE POLICY "Service role manages oauth_completions" ON oauth_completions
  FOR ALL USING (auth.role() = 'service_role');

-- Users can read their own completions (by connection_id pattern)
DROP POLICY IF EXISTS "Users can read own completions" ON oauth_completions;
CREATE POLICY "Users can read own completions" ON oauth_completions
  FOR SELECT USING (true); -- Allow reading for now, connection_id acts as auth

-- ============================================
-- 8. Helper functions
-- ============================================

-- Function to find or create organization by portal ID
CREATE OR REPLACE FUNCTION find_or_create_org_by_portal(
  p_portal_id TEXT,
  p_portal_domain TEXT,
  p_portal_name TEXT DEFAULT NULL
)
RETURNS TABLE(org_id UUID, is_new BOOLEAN, org_name TEXT) AS $$
DECLARE
  v_org_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_org_name TEXT;
BEGIN
  -- Try to find existing org
  SELECT id, name INTO v_org_id, v_org_name
  FROM organizations
  WHERE hubspot_portal_id = p_portal_id;

  IF v_org_id IS NULL THEN
    -- Create new org
    v_org_name := COALESCE(p_portal_name, p_portal_domain, 'My Organization');
    INSERT INTO organizations (name, hubspot_portal_id, hubspot_portal_domain)
    VALUES (v_org_name, p_portal_id, p_portal_domain)
    RETURNING id INTO v_org_id;
    v_is_new := TRUE;
  END IF;

  RETURN QUERY SELECT v_org_id, v_is_new, v_org_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to link user to organization
CREATE OR REPLACE FUNCTION link_user_to_org(
  p_auth_user_id UUID,
  p_org_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  -- Get email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = p_auth_user_id;

  -- Find or create user record
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    INSERT INTO users (auth_user_id, email, organization_id, role)
    VALUES (p_auth_user_id, v_email, p_org_id, p_role)
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE users SET organization_id = p_org_id, role = p_role
    WHERE id = v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
