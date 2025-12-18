-- Migration: Fix invitation RLS policy that's causing 500 errors
--
-- The LOWER() comparison may be causing issues. Let's use a more robust approach.

-- Drop the problematic policy
DROP POLICY IF EXISTS "invitations_view_own_email" ON invitations;

-- Recreate with case-insensitive comparison using citext-style comparison
-- Using LOWER() on both sides with explicit casting
CREATE POLICY "invitations_view_own_email" ON invitations
  FOR SELECT TO authenticated
  USING (
    LOWER(email) = LOWER((auth.jwt() ->> 'email')::text)
  );

-- Alternative: If the above still fails, you may need to grant execute on auth.jwt()
-- or use a simpler approach with a helper function

-- Create a helper function that safely gets the user's email
CREATE OR REPLACE FUNCTION get_auth_email()
RETURNS TEXT AS $$
  SELECT LOWER(COALESCE(auth.jwt() ->> 'email', ''));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_auth_email TO authenticated;

-- Recreate the policy using the helper function
DROP POLICY IF EXISTS "invitations_view_own_email" ON invitations;

CREATE POLICY "invitations_view_own_email" ON invitations
  FOR SELECT TO authenticated
  USING (
    LOWER(email) = get_auth_email()
  );
