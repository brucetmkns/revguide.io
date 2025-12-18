-- Migration 020: Allow users to view organizations they're invited to
--
-- Problem: When accepting an invitation, the user can't see the organization name
-- because they're not a member yet. The existing policy only allows viewing your own org.
--
-- Solution: Add a policy to allow viewing organizations that have invitations sent to your email.

-- Add policy to allow viewing orgs you're invited to
DROP POLICY IF EXISTS "Users can view org for invitation" ON organizations;

CREATE POLICY "Users can view org for invitation" ON organizations
  FOR SELECT TO authenticated
  USING (
    -- User can view org if there's a valid invitation to their email for this org
    EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.organization_id = organizations.id
      AND LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
      AND invitations.expires_at > now()
    )
  );

-- Also allow viewing orgs you're a member of (via organization_members)
DROP POLICY IF EXISTS "Users can view member orgs" ON organizations;

CREATE POLICY "Users can view member orgs" ON organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT get_user_org_ids(auth.uid()))
  );
