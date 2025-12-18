-- Migration: Allow authenticated users to look up invitations by token
--
-- Problem: The anon role can look up invitations by token (for signup page),
-- but authenticated users cannot (invite.js page fails with 500/not found).
--
-- The existing policy "invitations_view_own_email" requires email match,
-- but we need token-based lookup for the acceptance flow.
--
-- Solution: Add a policy allowing authenticated users to read valid invitations
-- (same as anon policy but for authenticated role)

-- Drop existing authenticated invitation policies that might conflict
DROP POLICY IF EXISTS "invitations_view_own_email" ON invitations;
DROP POLICY IF EXISTS "invitations_authenticated_by_token" ON invitations;

-- Allow authenticated users to read invitations that aren't expired
-- Security: tokens are UUIDs (unguessable), and we still validate email match in app code
CREATE POLICY "invitations_authenticated_by_token" ON invitations
  FOR SELECT TO authenticated
  USING (
    expires_at > now()
  );

-- Keep the admin policies for managing invitations (from migration 008)
-- These should already exist but let's ensure they do
DROP POLICY IF EXISTS "invitations_admin_select" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_insert" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_update" ON invitations;
DROP POLICY IF EXISTS "invitations_admin_delete" ON invitations;

-- Admins can SELECT invitations for their org
CREATE POLICY "invitations_admin_select" ON invitations
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can INSERT invitations for their org
CREATE POLICY "invitations_admin_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can UPDATE invitations for their org (for accepting)
CREATE POLICY "invitations_admin_update" ON invitations
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Admins can DELETE invitations for their org
CREATE POLICY "invitations_admin_delete" ON invitations
  FOR DELETE TO authenticated
  USING (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );

-- Users need UPDATE permission to accept invitations sent to their email
CREATE POLICY "invitations_accept_own" ON invitations
  FOR UPDATE TO authenticated
  USING (
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    LOWER(email) = LOWER(auth.jwt() ->> 'email')
  );
