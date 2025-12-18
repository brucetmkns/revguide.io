-- Migration: Multi-Portal Support for Agencies & Consultants
--
-- This migration adds support for consultants/agencies to manage multiple HubSpot portals.
--
-- Key changes:
-- 1. Add 'consultant' role to users
-- 2. Create organization_members junction table (many-to-many user<->org)
-- 3. Add active_organization_id to users for portal switching
-- 4. Create consultant_libraries table for reusable content packages
-- 5. Create library_installations table to track what's installed where
-- 6. Update RLS policies to support multi-org access

-- ============================================
-- 1. Add 'consultant' role to users table
-- ============================================

-- Drop old constraint and create new one with consultant role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member', 'consultant'));

-- Add active_organization_id column to track current portal context
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_organization_id UUID REFERENCES organizations(id);

-- Set active_organization_id to current organization_id for existing users
UPDATE users SET active_organization_id = organization_id WHERE active_organization_id IS NULL;

-- ============================================
-- 2. Create organization_members junction table
-- ============================================

-- This allows users to belong to multiple organizations with different roles
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'consultant')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one membership per org
  UNIQUE(user_id, organization_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

-- Enable RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organization_members
-- Users can see memberships for orgs they belong to
CREATE POLICY "Users can view org memberships" ON organization_members
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    )
  );

-- Only admins/owners/consultants can manage memberships
CREATE POLICY "Admins can manage org memberships" ON organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = organization_members.organization_id
      AND om.role IN ('owner', 'admin', 'consultant')
    )
  );

-- Migrate existing users to organization_members table
INSERT INTO organization_members (user_id, organization_id, role, joined_at)
SELECT id, organization_id, role, created_at
FROM users
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- ============================================
-- 3. Create consultant_libraries table
-- ============================================

CREATE TABLE IF NOT EXISTS consultant_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- Content stored as JSONB for flexibility
  content JSONB NOT NULL DEFAULT '{
    "wikiEntries": [],
    "plays": [],
    "banners": []
  }'::jsonb,

  -- Metadata
  is_public BOOLEAN DEFAULT FALSE, -- Future: marketplace feature
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_libraries_owner ON consultant_libraries(owner_id);

-- Enable RLS
ALTER TABLE consultant_libraries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for consultant_libraries
-- Owners can manage their own libraries
CREATE POLICY "Users can manage own libraries" ON consultant_libraries
  FOR ALL USING (
    owner_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Public libraries can be viewed by anyone (future marketplace)
CREATE POLICY "Anyone can view public libraries" ON consultant_libraries
  FOR SELECT USING (is_public = TRUE);

-- ============================================
-- 4. Create library_installations table
-- ============================================

-- Track which libraries are installed in which organizations
CREATE TABLE IF NOT EXISTS library_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES consultant_libraries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installed_version TEXT NOT NULL,
  installed_by UUID REFERENCES users(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Track what was actually installed (snapshot at install time)
  items_installed JSONB DEFAULT '{
    "wikiEntries": 0,
    "plays": 0,
    "banners": 0
  }'::jsonb,

  -- Unique constraint: one installation per library per org
  UNIQUE(library_id, organization_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_installations_org ON library_installations(organization_id);
CREATE INDEX IF NOT EXISTS idx_installations_library ON library_installations(library_id);

-- Enable RLS
ALTER TABLE library_installations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for library_installations
-- Users can see installations for orgs they belong to
CREATE POLICY "Users can view org installations" ON library_installations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    )
  );

-- Admins/consultants can manage installations
CREATE POLICY "Admins can manage installations" ON library_installations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = library_installations.organization_id
      AND om.role IN ('owner', 'admin', 'consultant')
    )
  );

-- ============================================
-- 5. Helper functions for multi-portal access
-- ============================================

-- Get user's active organization ID (for portal switching)
CREATE OR REPLACE FUNCTION get_user_active_organization_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT COALESCE(active_organization_id, organization_id)
  FROM users
  WHERE auth_user_id = p_auth_uid
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has access to a specific organization
CREATE OR REPLACE FUNCTION user_has_org_access(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = p_org_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user can edit content in a specific organization
CREATE OR REPLACE FUNCTION user_can_edit_in_org(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = p_org_id
    AND om.role IN ('owner', 'admin', 'editor', 'consultant')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is a consultant (has consultant role in any org)
CREATE OR REPLACE FUNCTION user_is_consultant(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role = 'consultant'
  ) OR EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.role = 'consultant'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get all organizations a user has access to
CREATE OR REPLACE FUNCTION get_user_organizations(p_auth_uid UUID)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  role TEXT
) AS $$
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    om.role
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  JOIN organizations o ON o.id = om.organization_id
  WHERE u.auth_user_id = p_auth_uid
  ORDER BY o.name;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_active_organization_id TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_org_access TO authenticated;
GRANT EXECUTE ON FUNCTION user_can_edit_in_org TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_consultant TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_organizations TO authenticated;

-- ============================================
-- 6. Update existing RLS helper to use active org
-- ============================================

-- Update get_user_organization_id to return active org when set
CREATE OR REPLACE FUNCTION get_user_organization_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT COALESCE(active_organization_id, organization_id)
  FROM users
  WHERE auth_user_id = p_auth_uid
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update check_user_can_edit_content to check membership role
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

  -- Check if user has edit permissions in the active org
  RETURN EXISTS (
    SELECT 1 FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE u.auth_user_id = p_auth_uid
    AND om.organization_id = v_active_org_id
    AND om.role IN ('owner', 'admin', 'editor', 'consultant')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New tables:
--   - organization_members: Many-to-many user<->org with per-org roles
--   - consultant_libraries: Reusable content packages owned by consultants
--   - library_installations: Track which libraries installed where
--
-- New columns:
--   - users.active_organization_id: Current portal context for switching
--
-- New roles:
--   - 'consultant': Can manage multiple portals and create libraries
--
-- New functions:
--   - get_user_active_organization_id(): Get user's current portal
--   - user_has_org_access(): Check if user can access an org
--   - user_can_edit_in_org(): Check edit permissions in specific org
--   - user_is_consultant(): Check if user has consultant privileges
--   - get_user_organizations(): List all orgs user has access to
--
-- Updated functions:
--   - get_user_organization_id(): Now returns active_organization_id
--   - check_user_can_edit_content(): Checks membership-based permissions
