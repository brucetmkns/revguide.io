-- Migration: Shareable Invite Links
--
-- This migration adds support for shareable invite links that allow
-- multiple users to join an organization without individual invitations.
--
-- Key features:
-- 1. Create invite_links table for reusable invite URLs
-- 2. Create invite_link_signups table to track who joined via each link
-- 3. Add helper functions for link management
-- 4. Add RLS policies for access control

-- ============================================
-- 1. Create invite_links table
-- ============================================

CREATE TABLE IF NOT EXISTS invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Link identification (unique code for URL)
  code TEXT NOT NULL UNIQUE,

  -- Configuration
  max_uses INTEGER NOT NULL DEFAULT 10,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer')),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Tracking
  use_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status (can be manually deactivated)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT valid_max_uses CHECK (max_uses >= 0),
  CONSTRAINT valid_use_count CHECK (use_count >= 0 AND (max_uses = 0 OR use_count <= max_uses))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invite_links_org ON invite_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(code);
CREATE INDEX IF NOT EXISTS idx_invite_links_active ON invite_links(is_active, expires_at) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE invite_links ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Create invite_link_signups table
-- ============================================

-- Track who signed up via each invite link (audit trail)
CREATE TABLE IF NOT EXISTS invite_link_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id UUID NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signed_up_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(invite_link_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_link_signups_link ON invite_link_signups(invite_link_id);

-- Enable RLS
ALTER TABLE invite_link_signups ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies for invite_links
-- ============================================

-- Admins can manage invite links for their org
CREATE POLICY "Admins can manage org invite links" ON invite_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
      AND u.organization_id = invite_links.organization_id
      AND u.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = invite_links.organization_id
      AND om.role IN ('owner', 'admin')
    )
  );

-- Anyone can validate invite links by code (for public signup page)
-- Only returns valid (active, not expired, not maxed out) links
CREATE POLICY "Public can validate invite links" ON invite_links
  FOR SELECT USING (
    is_active = TRUE
    AND expires_at > NOW()
    AND (max_uses = 0 OR use_count < max_uses)
  );

-- Service role has full access (for backend operations)
CREATE POLICY "Service role full access to invite links" ON invite_links
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. RLS Policies for invite_link_signups
-- ============================================

-- Admins can view signups for their org's links
CREATE POLICY "Admins can view org invite link signups" ON invite_link_signups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invite_links il
      JOIN users u ON (u.organization_id = il.organization_id OR EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.user_id = u.id AND om.organization_id = il.organization_id
      ))
      WHERE il.id = invite_link_signups.invite_link_id
      AND u.auth_user_id = auth.uid()
      AND u.role IN ('owner', 'admin')
    )
  );

-- Service role has full access (for signup operations)
CREATE POLICY "Service role full access to invite link signups" ON invite_link_signups
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 5. Helper Functions
-- ============================================

-- Generate a unique invite code (10-char alphanumeric)
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 10-character alphanumeric code
    v_code := substr(encode(gen_random_bytes(8), 'base64'), 1, 10);
    -- Replace problematic characters for URLs
    v_code := replace(replace(replace(v_code, '+', 'x'), '/', 'y'), '=', 'z');

    -- Check if code already exists
    SELECT EXISTS (SELECT 1 FROM invite_links WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get invite link details by code (for validation before signup)
CREATE OR REPLACE FUNCTION get_invite_link_by_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  organization_name TEXT,
  role TEXT,
  max_uses INTEGER,
  use_count INTEGER,
  remaining_uses INTEGER,
  expires_at TIMESTAMPTZ,
  is_valid BOOLEAN
) AS $$
  SELECT
    il.id,
    il.organization_id,
    o.name as organization_name,
    il.role,
    il.max_uses,
    il.use_count,
    CASE WHEN il.max_uses = 0 THEN -1 ELSE il.max_uses - il.use_count END as remaining_uses,
    il.expires_at,
    (il.is_active AND il.expires_at > NOW() AND (il.max_uses = 0 OR il.use_count < il.max_uses)) as is_valid
  FROM invite_links il
  JOIN organizations o ON o.id = il.organization_id
  WHERE il.code = p_code;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Consume an invite link (atomically increment counter and record signup)
CREATE OR REPLACE FUNCTION consume_invite_link(p_code TEXT, p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  organization_id UUID,
  organization_name TEXT,
  role TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_link invite_links%ROWTYPE;
  v_org organizations%ROWTYPE;
BEGIN
  -- Get and lock the invite link
  SELECT * INTO v_link
  FROM invite_links
  WHERE code = p_code
  AND is_active = TRUE
  AND expires_at > NOW()
  AND (max_uses = 0 OR use_count < max_uses)
  FOR UPDATE;

  IF v_link.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, 'Invalid or expired invite link'::TEXT;
    RETURN;
  END IF;

  -- Get organization details
  SELECT * INTO v_org FROM organizations WHERE id = v_link.organization_id;

  -- Increment use count
  UPDATE invite_links
  SET use_count = use_count + 1
  WHERE id = v_link.id;

  -- Record the signup
  INSERT INTO invite_link_signups (invite_link_id, user_id)
  VALUES (v_link.id, p_user_id)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT TRUE, v_link.organization_id, v_org.name, v_link.role, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active invite links for an organization
CREATE OR REPLACE FUNCTION get_org_invite_links(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  code TEXT,
  max_uses INTEGER,
  use_count INTEGER,
  role TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  created_by_name TEXT,
  is_valid BOOLEAN
) AS $$
  SELECT
    il.id,
    il.code,
    il.max_uses,
    il.use_count,
    il.role,
    il.expires_at,
    il.created_at,
    u.name as created_by_name,
    (il.is_active AND il.expires_at > NOW() AND (il.max_uses = 0 OR il.use_count < il.max_uses)) as is_valid
  FROM invite_links il
  LEFT JOIN users u ON u.id = il.created_by
  WHERE il.organization_id = p_org_id
  AND il.is_active = TRUE
  ORDER BY il.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_invite_code TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_link_by_code TO anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_invite_link TO service_role;
GRANT EXECUTE ON FUNCTION get_org_invite_links TO authenticated;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New tables:
--   - invite_links: Stores shareable invite link configurations
--   - invite_link_signups: Tracks users who joined via each link
--
-- New functions:
--   - generate_invite_code(): Generate unique 10-char code
--   - get_invite_link_by_code(): Validate and get link details
--   - consume_invite_link(): Atomically use a link
--   - get_org_invite_links(): Get active links for an org
--
