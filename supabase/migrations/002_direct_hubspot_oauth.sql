-- Migration: Direct HubSpot OAuth (replacing Nango)
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Enable pgcrypto for token encryption
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 2. Add token columns to hubspot_connections
-- ============================================

-- Make nango_connection_id nullable (no longer required)
ALTER TABLE hubspot_connections ALTER COLUMN nango_connection_id DROP NOT NULL;

-- Add encrypted token storage columns
ALTER TABLE hubspot_connections ADD COLUMN IF NOT EXISTS access_token_encrypted BYTEA;
ALTER TABLE hubspot_connections ADD COLUMN IF NOT EXISTS refresh_token_encrypted BYTEA;
ALTER TABLE hubspot_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Index for finding connections with expiring tokens
CREATE INDEX IF NOT EXISTS idx_hubspot_connections_token_expires
  ON hubspot_connections(token_expires_at)
  WHERE is_active = TRUE;

-- ============================================
-- 3. Create oauth_states table (CSRF protection)
-- ============================================

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  return_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Index for quick state lookups
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);

-- Auto-cleanup old states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- RLS for oauth_states
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Service role can manage all states
DROP POLICY IF EXISTS "Service role manages oauth_states" ON oauth_states;
CREATE POLICY "Service role manages oauth_states" ON oauth_states
  FOR ALL USING (auth.role() = 'service_role');

-- Users can read their own states
DROP POLICY IF EXISTS "Users can read own states" ON oauth_states;
CREATE POLICY "Users can read own states" ON oauth_states
  FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- 4. Helper functions for token encryption
-- ============================================

-- Encrypt a token (call from edge function with encryption key)
CREATE OR REPLACE FUNCTION encrypt_hubspot_token(
  p_token TEXT,
  p_encryption_key TEXT
)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_token, p_encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt a token (call from edge function with encryption key)
CREATE OR REPLACE FUNCTION decrypt_hubspot_token(
  p_encrypted_token BYTEA,
  p_encryption_key TEXT
)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(p_encrypted_token, p_encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Function to store HubSpot connection with tokens
-- ============================================

CREATE OR REPLACE FUNCTION store_hubspot_connection(
  p_organization_id UUID,
  p_portal_id TEXT,
  p_portal_domain TEXT,
  p_portal_name TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER,
  p_scopes TEXT[],
  p_connected_by UUID,
  p_encryption_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_connection_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Calculate token expiry
  v_expires_at := NOW() + (p_expires_in || ' seconds')::INTERVAL;

  -- Upsert the connection (update if portal already connected to this org)
  INSERT INTO hubspot_connections (
    organization_id,
    portal_id,
    portal_domain,
    portal_name,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    scopes,
    connected_by,
    connected_at,
    is_active
  ) VALUES (
    p_organization_id,
    p_portal_id,
    p_portal_domain,
    p_portal_name,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    v_expires_at,
    p_scopes,
    p_connected_by,
    NOW(),
    TRUE
  )
  ON CONFLICT (organization_id, portal_id)
  DO UPDATE SET
    portal_domain = EXCLUDED.portal_domain,
    portal_name = EXCLUDED.portal_name,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    token_expires_at = EXCLUDED.token_expires_at,
    scopes = EXCLUDED.scopes,
    connected_by = EXCLUDED.connected_by,
    connected_at = NOW(),
    is_active = TRUE
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to update tokens after refresh
-- ============================================

CREATE OR REPLACE FUNCTION update_hubspot_tokens(
  p_connection_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER,
  p_encryption_key TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE hubspot_connections
  SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, p_encryption_key),
    refresh_token_encrypted = pgp_sym_encrypt(p_refresh_token, p_encryption_key),
    token_expires_at = NOW() + (p_expires_in || ' seconds')::INTERVAL
  WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Function to get decrypted access token
-- ============================================

CREATE OR REPLACE FUNCTION get_hubspot_access_token(
  p_connection_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE(
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pgp_sym_decrypt(hc.access_token_encrypted, p_encryption_key) AS access_token,
    hc.token_expires_at,
    pgp_sym_decrypt(hc.refresh_token_encrypted, p_encryption_key) AS refresh_token,
    hc.token_expires_at < NOW() AS is_expired
  FROM hubspot_connections hc
  WHERE hc.id = p_connection_id AND hc.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Cleanup function for expired states
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Update organizations table (remove Nango reference)
-- ============================================

-- We'll keep nango_connection_id for backward compatibility but it's no longer used
-- ALTER TABLE organizations DROP COLUMN IF EXISTS nango_connection_id;

-- ============================================
-- 10. Grant execute permissions to service role
-- ============================================

GRANT EXECUTE ON FUNCTION encrypt_hubspot_token TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_hubspot_token TO service_role;
GRANT EXECUTE ON FUNCTION store_hubspot_connection TO service_role;
GRANT EXECUTE ON FUNCTION update_hubspot_tokens TO service_role;
GRANT EXECUTE ON FUNCTION get_hubspot_access_token TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_oauth_states TO service_role;
