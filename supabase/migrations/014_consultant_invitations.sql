-- Migration: Consultant Invitation System
--
-- This migration adds support for bidirectional consultant invitations:
-- 1. Admins can invite consultants to their organization
-- 2. Consultants can request access to organizations
-- 3. Auto-connect existing consultants when invited
--
-- Key changes:
-- 1. Extend invitations table with invitation_type and auto_accepted columns
-- 2. Create consultant_access_requests table for consultant-initiated requests
-- 3. Add helper functions for consultant lookup and org search
-- 4. Add RLS policies for access requests

-- ============================================
-- 1. Extend invitations table
-- ============================================

-- Add invitation_type to distinguish between team and consultant invitations
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS invitation_type TEXT DEFAULT 'team'
  CHECK (invitation_type IN ('team', 'consultant'));

-- Track if invitation was auto-accepted (for existing consultants)
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS auto_accepted BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. Create consultant_access_requests table
-- ============================================

-- This table tracks requests from consultants to join organizations
CREATE TABLE IF NOT EXISTS consultant_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  message TEXT, -- Optional message from consultant explaining why they want access
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT, -- Admin can add notes when declining
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each consultant can only have one active request per org
  UNIQUE(consultant_user_id, organization_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_access_requests_org ON consultant_access_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_consultant ON consultant_access_requests(consultant_user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON consultant_access_requests(status);

-- Enable RLS
ALTER TABLE consultant_access_requests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies for consultant_access_requests
-- ============================================

-- Admins/owners can view and manage requests for their organization
CREATE POLICY "Admins can view org access requests" ON consultant_access_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = consultant_access_requests.organization_id
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update org access requests" ON consultant_access_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.organization_id = consultant_access_requests.organization_id
      AND om.role IN ('owner', 'admin')
    )
  );

-- Consultants can view their own requests
CREATE POLICY "Consultants can view own requests" ON consultant_access_requests
  FOR SELECT USING (
    consultant_user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Consultants can create requests (must be for themselves)
CREATE POLICY "Consultants can create requests" ON consultant_access_requests
  FOR INSERT WITH CHECK (
    consultant_user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Consultants can cancel their own pending requests
CREATE POLICY "Consultants can cancel own pending requests" ON consultant_access_requests
  FOR UPDATE USING (
    consultant_user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'cancelled'
  );

-- Service role can do anything (for backend operations)
CREATE POLICY "Service role full access to access requests" ON consultant_access_requests
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Helper Functions
-- ============================================

-- Check if a user exists by email and if they're a consultant
CREATE OR REPLACE FUNCTION get_user_by_email(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  auth_user_id UUID,
  user_name TEXT,
  is_consultant BOOLEAN,
  has_account BOOLEAN
) AS $$
  SELECT
    u.id as user_id,
    u.auth_user_id,
    u.name as user_name,
    (u.role = 'consultant' OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = u.id AND om.role = 'consultant'
    )) as is_consultant,
    TRUE as has_account
  FROM users u
  WHERE LOWER(u.email) = LOWER(p_email)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-connect a consultant to an organization
CREATE OR REPLACE FUNCTION auto_connect_consultant(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Add to organization_members with consultant role
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (p_user_id, p_organization_id, 'consultant', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending access requests for an organization (for admins)
CREATE OR REPLACE FUNCTION get_org_access_requests(p_org_id UUID)
RETURNS TABLE (
  request_id UUID,
  consultant_id UUID,
  consultant_name TEXT,
  consultant_email TEXT,
  message TEXT,
  requested_at TIMESTAMPTZ,
  status TEXT
) AS $$
  SELECT
    car.id as request_id,
    car.consultant_user_id as consultant_id,
    u.name as consultant_name,
    u.email as consultant_email,
    car.message,
    car.requested_at,
    car.status
  FROM consultant_access_requests car
  JOIN users u ON u.id = car.consultant_user_id
  WHERE car.organization_id = p_org_id
  AND car.status = 'pending'
  ORDER BY car.requested_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Search organizations by name (for consultants requesting access)
-- Only returns orgs where the user is NOT already a member
CREATE OR REPLACE FUNCTION search_organizations_for_consultant(
  p_auth_uid UUID,
  p_query TEXT
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  has_pending_request BOOLEAN
) AS $$
  SELECT
    o.id as organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    EXISTS (
      SELECT 1 FROM consultant_access_requests car
      WHERE car.organization_id = o.id
      AND car.consultant_user_id = (SELECT id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1)
      AND car.status = 'pending'
    ) as has_pending_request
  FROM organizations o
  WHERE
    -- Match query against name (case insensitive)
    LOWER(o.name) LIKE LOWER('%' || p_query || '%')
    -- Exclude orgs where user is already a member
    AND NOT EXISTS (
      SELECT 1 FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = p_auth_uid
      AND om.organization_id = o.id
    )
  ORDER BY o.name
  LIMIT 10;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get consultant's own access requests (for their dashboard)
CREATE OR REPLACE FUNCTION get_consultant_access_requests(p_auth_uid UUID)
RETURNS TABLE (
  request_id UUID,
  organization_id UUID,
  organization_name TEXT,
  portal_id TEXT,
  status TEXT,
  message TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
) AS $$
  SELECT
    car.id as request_id,
    car.organization_id,
    o.name as organization_name,
    o.hubspot_portal_id as portal_id,
    car.status,
    car.message,
    car.requested_at,
    car.reviewed_at,
    car.review_notes
  FROM consultant_access_requests car
  JOIN organizations o ON o.id = car.organization_id
  WHERE car.consultant_user_id = (SELECT id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1)
  ORDER BY
    CASE WHEN car.status = 'pending' THEN 0 ELSE 1 END,
    car.requested_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Approve an access request (adds consultant to org)
CREATE OR REPLACE FUNCTION approve_access_request(
  p_request_id UUID,
  p_reviewer_auth_uid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_consultant_id UUID;
  v_org_id UUID;
  v_reviewer_id UUID;
BEGIN
  -- Get reviewer user id
  SELECT id INTO v_reviewer_id FROM users WHERE auth_user_id = p_reviewer_auth_uid LIMIT 1;

  -- Get request details
  SELECT consultant_user_id, organization_id INTO v_consultant_id, v_org_id
  FROM consultant_access_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_consultant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Add consultant to organization
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_consultant_id, v_org_id, 'consultant', NOW())
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  -- Update request status
  UPDATE consultant_access_requests
  SET status = 'approved',
      reviewed_by = v_reviewer_id,
      reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decline an access request
CREATE OR REPLACE FUNCTION decline_access_request(
  p_request_id UUID,
  p_reviewer_auth_uid UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_reviewer_id UUID;
BEGIN
  -- Get reviewer user id
  SELECT id INTO v_reviewer_id FROM users WHERE auth_user_id = p_reviewer_auth_uid LIMIT 1;

  -- Update request status
  UPDATE consultant_access_requests
  SET status = 'declined',
      reviewed_by = v_reviewer_id,
      reviewed_at = NOW(),
      review_notes = p_notes
  WHERE id = p_request_id AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get admin emails for an organization (for sending request notifications)
CREATE OR REPLACE FUNCTION get_org_admin_emails(p_org_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT
) AS $$
  SELECT
    u.id as user_id,
    u.email,
    u.name
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  WHERE om.organization_id = p_org_id
  AND om.role IN ('owner', 'admin')
  ORDER BY
    CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END,
    u.created_at;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_by_email TO authenticated;
GRANT EXECUTE ON FUNCTION auto_connect_consultant TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_access_requests TO authenticated;
GRANT EXECUTE ON FUNCTION search_organizations_for_consultant TO authenticated;
GRANT EXECUTE ON FUNCTION get_consultant_access_requests TO authenticated;
GRANT EXECUTE ON FUNCTION approve_access_request TO authenticated;
GRANT EXECUTE ON FUNCTION decline_access_request TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_admin_emails TO authenticated;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- Extended tables:
--   - invitations: Added invitation_type ('team'|'consultant') and auto_accepted columns
--
-- New tables:
--   - consultant_access_requests: Tracks consultant requests to join organizations
--
-- New functions:
--   - get_user_by_email(): Check if user exists and is consultant
--   - auto_connect_consultant(): Add existing consultant to org
--   - get_org_access_requests(): Get pending requests for org (admin view)
--   - search_organizations_for_consultant(): Search orgs to request access
--   - get_consultant_access_requests(): Get consultant's own requests
--   - approve_access_request(): Approve request and add to org
--   - decline_access_request(): Decline request with optional notes
--   - get_org_admin_emails(): Get admin emails for notifications
--
