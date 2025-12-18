-- Migration: Fix case-sensitive email comparison in invitation RLS policy
--
-- Problem: The invitations_view_own_email policy uses exact string match
-- which is case-sensitive. If invitation email differs in case from JWT email,
-- the policy blocks access.
--
-- Solution: Use LOWER() for case-insensitive comparison

-- Drop existing policy
DROP POLICY IF EXISTS "invitations_view_own_email" ON invitations;

-- Recreate with case-insensitive comparison
CREATE POLICY "invitations_view_own_email" ON invitations
  FOR SELECT USING (
    LOWER(email) = LOWER(auth.jwt()->>'email')
  );

-- Also ensure the invitations table stores emails in lowercase
-- (optional: normalize existing data)
UPDATE invitations SET email = LOWER(email) WHERE email != LOWER(email);
