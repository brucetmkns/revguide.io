-- Migration: User-Level HubSpot OAuth Connections
-- Allows individual users to connect their HubSpot accounts
-- Property updates will be attributed to the specific user in HubSpot history

-- ============================================
-- 1. Create user_hubspot_connections table
-- ============================================

CREATE TABLE IF NOT EXISTS user_hubspot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and org context
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portal_id TEXT NOT NULL,

  -- Encrypted tokens (same pattern as hubspot_connections)
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  token_expires_at TIMESTAMPTZ,

  -- HubSpot user info (for attribution in property history)
  hubspot_user_id TEXT,
  hubspot_user_email TEXT,

  -- OAuth metadata
  scopes TEXT[],

  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, organization_id, portal_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_hubspot_active
  ON user_hubspot_connections(user_id, organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_hubspot_token_expires
  ON user_hubspot_connections(token_expires_at)
  WHERE is_active = TRUE;

-- ============================================
-- 2. RLS Policies
-- ============================================

ALTER TABLE user_hubspot_connections ENABLE ROW LEVEL SECURITY;

-- Users can see their own connections
DROP POLICY IF EXISTS "Users see own connections" ON user_hubspot_connections;
CREATE POLICY "Users see own connections" ON user_hubspot_connections
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Service role can manage all
DROP POLICY IF EXISTS "Service role manages all" ON user_hubspot_connections;
CREATE POLICY "Service role manages all" ON user_hubspot_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 3. Function to store user-level HubSpot connection
-- ============================================

CREATE OR REPLACE FUNCTION store_user_hubspot_connection(
  p_user_id UUID,
  p_organization_id UUID,
  p_portal_id TEXT,
  p_hubspot_user_id TEXT,
  p_hubspot_user_email TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER,
  p_scopes TEXT[],
  p_encryption_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_connection_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Calculate token expiry
  v_expires_at := NOW() + (p_expires_in || ' seconds')::INTERVAL;

  -- Upsert the connection
  INSERT INTO user_hubspot_connections (
    user_id,
    organization_id,
    portal_id,
    hubspot_user_id,
    hubspot_user_email,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    scopes,
    connected_at,
    is_active
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_portal_id,
    p_hubspot_user_id,
    p_hubspot_user_email,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    v_expires_at,
    p_scopes,
    NOW(),
    TRUE
  )
  ON CONFLICT (user_id, organization_id, portal_id)
  DO UPDATE SET
    hubspot_user_id = EXCLUDED.hubspot_user_id,
    hubspot_user_email = EXCLUDED.hubspot_user_email,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    token_expires_at = EXCLUDED.token_expires_at,
    scopes = EXCLUDED.scopes,
    connected_at = NOW(),
    is_active = TRUE,
    updated_at = NOW()
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Function to get user's connection for an org
-- ============================================

CREATE OR REPLACE FUNCTION get_user_hubspot_connection(
  p_user_id UUID,
  p_organization_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE(
  connection_id UUID,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  is_expired BOOLEAN,
  hubspot_user_id TEXT,
  hubspot_user_email TEXT,
  portal_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    uhc.id AS connection_id,
    pgp_sym_decrypt(uhc.access_token_encrypted, p_encryption_key) AS access_token,
    uhc.token_expires_at,
    pgp_sym_decrypt(uhc.refresh_token_encrypted, p_encryption_key) AS refresh_token,
    uhc.token_expires_at < NOW() AS is_expired,
    uhc.hubspot_user_id,
    uhc.hubspot_user_email,
    uhc.portal_id
  FROM user_hubspot_connections uhc
  WHERE uhc.user_id = p_user_id
    AND uhc.organization_id = p_organization_id
    AND uhc.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Function to update user tokens after refresh
-- ============================================

CREATE OR REPLACE FUNCTION update_user_hubspot_tokens(
  p_connection_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER,
  p_encryption_key TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_hubspot_connections
  SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    refresh_token_encrypted = pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    token_expires_at = NOW() + (p_expires_in || ' seconds')::INTERVAL,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to disconnect user connection
-- ============================================

CREATE OR REPLACE FUNCTION disconnect_user_hubspot(
  p_connection_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_hubspot_connections
  SET
    is_active = FALSE,
    access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Grant execute permissions to service role
-- ============================================

GRANT EXECUTE ON FUNCTION store_user_hubspot_connection TO service_role;
GRANT EXECUTE ON FUNCTION get_user_hubspot_connection TO service_role;
GRANT EXECUTE ON FUNCTION update_user_hubspot_tokens TO service_role;
GRANT EXECUTE ON FUNCTION disconnect_user_hubspot TO service_role;
