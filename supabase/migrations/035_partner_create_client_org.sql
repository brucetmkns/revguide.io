-- Migration: Partner-Created Client Organizations
--
-- This migration adds the ability for partners to create new client
-- organizations on behalf of customers, enabling turnkey onboarding.
--
-- Key features:
-- 1. create_client_organization(): Partner creates a new org
-- 2. invite_org_owner(): Partner invites customer to claim ownership
-- 3. Support for 'ownership_claim' invitation type
--
-- User flow:
-- 1. Partner creates org -> immediately added as partner manager
-- 2. Partner invites owner -> customer email receives invitation
-- 3. Customer accepts -> becomes owner, partner remains as manager

-- ============================================
-- 1. Update invitation constraints for ownership_claim type
-- ============================================

-- Add 'ownership_claim' to invitation_type constraint
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invitation_type_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_invitation_type_check
  CHECK (invitation_type IN ('team', 'consultant', 'partner', 'ownership_claim'));

-- ============================================
-- 2. Create client organization function
-- ============================================

-- Partners can create a new organization and be added as a partner manager
CREATE OR REPLACE FUNCTION create_client_organization(
  p_auth_uid UUID,
  p_org_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  organization_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_new_org_id UUID;
  v_slug TEXT;
BEGIN
  -- Get user id and verify they are a partner
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = p_auth_uid
  AND account_type = 'partner'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'User not found or not a partner account'::TEXT;
    RETURN;
  END IF;

  -- Validate org name
  IF p_org_name IS NULL OR TRIM(p_org_name) = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Organization name is required'::TEXT;
    RETURN;
  END IF;

  -- Generate slug from org name (same pattern as convert_to_partner_account)
  v_slug := lower(regexp_replace(TRIM(p_org_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  -- Add random suffix to ensure uniqueness
  v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  -- Create new organization
  INSERT INTO organizations (name, slug)
  VALUES (TRIM(p_org_name), v_slug)
  RETURNING id INTO v_new_org_id;

  -- Add partner as a member with 'partner' role
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_user_id, v_new_org_id, 'partner', NOW());

  RETURN QUERY SELECT TRUE, v_new_org_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Invite organization owner function
-- ============================================

-- Partners can invite a customer to become the owner of an org they manage
CREATE OR REPLACE FUNCTION invite_org_owner(
  p_auth_uid UUID,
  p_organization_id UUID,
  p_customer_email TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  invitation_id UUID,
  invitation_token TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_new_invitation_id UUID;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_normalized_email TEXT;
BEGIN
  -- Normalize email
  v_normalized_email := LOWER(TRIM(p_customer_email));

  -- Validate email format (basic check)
  IF v_normalized_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Invalid email address'::TEXT;
    RETURN;
  END IF;

  -- Get user id
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = p_auth_uid
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Verify caller is a partner in this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = p_organization_id
    AND role = 'partner'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'You are not a partner manager of this organization'::TEXT;
    RETURN;
  END IF;

  -- Check if org already has an owner
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
    AND role = 'owner'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'This organization already has an owner'::TEXT;
    RETURN;
  END IF;

  -- Check for existing pending ownership invitation
  IF EXISTS (
    SELECT 1 FROM invitations
    WHERE organization_id = p_organization_id
    AND invitation_type = 'ownership_claim'
    AND accepted_at IS NULL
    AND expires_at > NOW()
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'An ownership invitation is already pending for this organization'::TEXT;
    RETURN;
  END IF;

  -- Generate token and expiry
  v_token := gen_random_uuid()::text;
  v_expires_at := NOW() + INTERVAL '7 days';

  -- Create the invitation
  INSERT INTO invitations (
    organization_id,
    email,
    role,
    invitation_type,
    invited_by,
    token,
    expires_at
  )
  VALUES (
    p_organization_id,
    v_normalized_email,
    'owner',
    'ownership_claim',
    v_user_id,
    v_token,
    v_expires_at
  )
  RETURNING id INTO v_new_invitation_id;

  RETURN QUERY SELECT TRUE, v_new_invitation_id, v_token, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Helper function to check if org has owner
-- ============================================

CREATE OR REPLACE FUNCTION org_has_owner(p_organization_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
    AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 5. Helper function to get pending ownership invitation
-- ============================================

CREATE OR REPLACE FUNCTION get_pending_ownership_invitation(p_organization_id UUID)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
  SELECT
    id as invitation_id,
    email,
    created_at,
    expires_at
  FROM invitations
  WHERE organization_id = p_organization_id
  AND invitation_type = 'ownership_claim'
  AND accepted_at IS NULL
  AND expires_at > NOW()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 6. Function to cancel/resend ownership invitation
-- ============================================

CREATE OR REPLACE FUNCTION cancel_ownership_invitation(
  p_auth_uid UUID,
  p_invitation_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Get user id
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = p_auth_uid
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Get org from invitation and verify it's an ownership_claim type
  SELECT organization_id INTO v_org_id
  FROM invitations
  WHERE id = p_invitation_id
  AND invitation_type = 'ownership_claim'
  AND accepted_at IS NULL;

  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Invitation not found or already accepted'::TEXT;
    RETURN;
  END IF;

  -- Verify caller is a partner in this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id
    AND organization_id = v_org_id
    AND role = 'partner'
  ) THEN
    RETURN QUERY SELECT FALSE, 'You are not a partner manager of this organization'::TEXT;
    RETURN;
  END IF;

  -- Delete the invitation
  DELETE FROM invitations WHERE id = p_invitation_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Grant execute permissions
-- ============================================

GRANT EXECUTE ON FUNCTION create_client_organization TO authenticated;
GRANT EXECUTE ON FUNCTION invite_org_owner TO authenticated;
GRANT EXECUTE ON FUNCTION org_has_owner TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_ownership_invitation TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_ownership_invitation TO authenticated;

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New invitation type:
--   - 'ownership_claim': Invitation to become owner of a partner-created org
--
-- New functions:
--   - create_client_organization(): Partner creates new client org
--   - invite_org_owner(): Partner invites customer to become owner
--   - org_has_owner(): Check if org has an owner
--   - get_pending_ownership_invitation(): Get pending ownership invite for org
--   - cancel_ownership_invitation(): Cancel a pending ownership invite
--
-- Flow:
--   1. Partner calls create_client_organization() -> new org created, partner added
--   2. Partner calls invite_org_owner() -> invitation created with token
--   3. API sends email with invite link
--   4. Customer accepts invitation -> becomes owner (handled by existing acceptInvitation)
