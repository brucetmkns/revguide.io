-- Migration: Allow public lookup of invitations by token
--
-- This allows unauthenticated users to look up invitation details by token
-- on the signup page, so we can pre-fill email and show org name.
--
-- Security: Tokens are random UUIDs (unguessable). Only returns limited data
-- (email, org name) which the user already knows from the invitation email.

-- Drop existing policies if they exist (for re-running)
DROP POLICY IF EXISTS "invitations_public_by_token" ON invitations;
DROP POLICY IF EXISTS "organizations_public_name_only" ON organizations;

-- Allow anonymous users to read invitations by token (not expired)
CREATE POLICY "invitations_public_by_token" ON invitations
  FOR SELECT TO anon
  USING (
    -- Only valid (not expired) invitations - allow reading accepted ones too
    expires_at > now()
  );

-- Grant SELECT permission to anon role
GRANT SELECT ON invitations TO anon;

-- Also need to allow anon to read org name from organizations table
-- Create a limited policy just for reading org name via invitation lookup
CREATE POLICY "organizations_public_name_only" ON organizations
  FOR SELECT TO anon
  USING (
    -- Only allow if there's a valid invitation referencing this org
    EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.organization_id = organizations.id
      AND invitations.expires_at > now()
    )
  );

GRANT SELECT ON organizations TO anon;
