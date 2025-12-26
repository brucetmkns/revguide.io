-- Migration: Partner Branding / White-Label Support
--
-- This migration adds white-labeling capabilities for partner accounts:
-- 1. New partner_branding table for storing brand customization
-- 2. Link from organizations to partner branding (for client orgs)
-- 3. Helper functions for branding resolution
-- 4. RLS policies for secure access
--
-- Branding cascades: Partner's branding applies to all their client orgs

-- ============================================
-- 1. Create partner_branding table
-- ============================================

CREATE TABLE IF NOT EXISTS partner_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Display Identity
  display_name TEXT NOT NULL,                       -- Replaces "RevGuide" in UI
  tagline TEXT,                                     -- Optional tagline

  -- Visual Identity
  logo_url TEXT,                                    -- Primary logo (from Supabase Storage)
  logo_icon_url TEXT,                               -- Square icon version (for small spaces)
  favicon_url TEXT,                                 -- Favicon for web admin

  -- Colors (CSS variable overrides)
  primary_color TEXT DEFAULT '#b2ef63',             -- Main brand color (hex)
  primary_hover_color TEXT,                         -- Hover state (auto-calculated if null)
  accent_color TEXT,                                -- Secondary accent

  -- Typography (optional)
  font_family TEXT,                                 -- Google Font name, null = use Manrope
  font_url TEXT,                                    -- Google Fonts URL if custom font

  -- Links & URLs
  help_url TEXT,                                    -- Custom help center URL
  support_email TEXT,                               -- Support contact email
  website_url TEXT,                                 -- Agency website
  privacy_url TEXT,                                 -- Privacy policy URL
  terms_url TEXT,                                   -- Terms of service URL

  -- Email Branding
  email_from_name TEXT,                             -- "Acme Agency"
  email_from_address TEXT,                          -- "notifications@acmeagency.com"
  email_reply_to TEXT,                              -- Reply-to address
  email_domain TEXT,                                -- Extracted domain for verification
  email_domain_verified BOOLEAN DEFAULT FALSE,

  -- Tooltip/Content Attribution
  -- 'agency' = Show partner display_name
  -- 'revguide' = Show "Powered by RevGuide"
  -- 'none' = No attribution
  tooltip_attribution TEXT DEFAULT 'revguide'
    CHECK (tooltip_attribution IN ('agency', 'revguide', 'none')),

  -- Future: Custom Domain (Phase 2)
  custom_domain TEXT,                               -- "app.acmeagency.com"
  custom_domain_verified BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_partner_branding_org ON partner_branding(organization_id);
CREATE INDEX IF NOT EXISTS idx_partner_branding_domain ON partner_branding(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_branding_email_domain ON partner_branding(email_domain) WHERE email_domain IS NOT NULL;

-- Add comment
COMMENT ON TABLE partner_branding IS 'White-label branding configuration for partner accounts';

-- ============================================
-- 2. Add partner_branding_id to organizations
-- ============================================

-- This links client organizations to their partner's branding
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_branding_id UUID REFERENCES partner_branding(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_partner_branding ON organizations(partner_branding_id) WHERE partner_branding_id IS NOT NULL;

COMMENT ON COLUMN organizations.partner_branding_id IS 'Links client org to partner branding (for white-label cascade)';

-- ============================================
-- 3. Enable RLS on partner_branding
-- ============================================

ALTER TABLE partner_branding ENABLE ROW LEVEL SECURITY;

-- Policy: Partners can read their own branding
DROP POLICY IF EXISTS "Partners can read own branding" ON partner_branding;
CREATE POLICY "Partners can read own branding" ON partner_branding
  FOR SELECT USING (
    -- User is member of the branding's organization
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Policy: Users can read branding of their org's linked partner
DROP POLICY IF EXISTS "Users can read linked partner branding" ON partner_branding;
CREATE POLICY "Users can read linked partner branding" ON partner_branding
  FOR SELECT USING (
    -- User's active org has this branding linked
    id IN (
      SELECT o.partner_branding_id FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND o.partner_branding_id IS NOT NULL
    )
  );

-- Policy: Only org owners/admins can insert branding
DROP POLICY IF EXISTS "Org admins can insert branding" ON partner_branding;
CREATE POLICY "Org admins can insert branding" ON partner_branding
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    -- Only partner accounts can create branding
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND account_type = 'partner'
    )
  );

-- Policy: Only org owners/admins can update branding
DROP POLICY IF EXISTS "Org admins can update branding" ON partner_branding;
CREATE POLICY "Org admins can update branding" ON partner_branding
  FOR UPDATE USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Policy: Only org owners can delete branding
DROP POLICY IF EXISTS "Org owners can delete branding" ON partner_branding;
CREATE POLICY "Org owners can delete branding" ON partner_branding
  FOR DELETE USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- ============================================
-- 4. Helper Functions for Branding
-- ============================================

-- Get branding for an organization (resolves partner cascade)
CREATE OR REPLACE FUNCTION get_organization_branding(p_org_id UUID)
RETURNS TABLE (
  branding_id UUID,
  display_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  logo_icon_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  primary_hover_color TEXT,
  accent_color TEXT,
  font_family TEXT,
  font_url TEXT,
  help_url TEXT,
  support_email TEXT,
  website_url TEXT,
  privacy_url TEXT,
  terms_url TEXT,
  email_from_name TEXT,
  email_from_address TEXT,
  email_reply_to TEXT,
  email_domain_verified BOOLEAN,
  tooltip_attribution TEXT,
  custom_domain TEXT,
  custom_domain_verified BOOLEAN,
  is_partner_branding BOOLEAN
) AS $$
DECLARE
  v_partner_branding_id UUID;
  v_home_org_id UUID;
BEGIN
  -- First check if org has linked partner branding
  SELECT o.partner_branding_id INTO v_partner_branding_id
  FROM organizations o
  WHERE o.id = p_org_id;

  IF v_partner_branding_id IS NOT NULL THEN
    -- Return linked partner's branding
    RETURN QUERY
    SELECT
      pb.id,
      pb.display_name,
      pb.tagline,
      pb.logo_url,
      pb.logo_icon_url,
      pb.favicon_url,
      pb.primary_color,
      pb.primary_hover_color,
      pb.accent_color,
      pb.font_family,
      pb.font_url,
      pb.help_url,
      pb.support_email,
      pb.website_url,
      pb.privacy_url,
      pb.terms_url,
      pb.email_from_name,
      pb.email_from_address,
      pb.email_reply_to,
      pb.email_domain_verified,
      pb.tooltip_attribution,
      pb.custom_domain,
      pb.custom_domain_verified,
      TRUE as is_partner_branding
    FROM partner_branding pb
    WHERE pb.organization_id = v_partner_branding_id;
    RETURN;
  END IF;

  -- Check if this org has its own branding (it's a partner org)
  RETURN QUERY
  SELECT
    pb.id,
    pb.display_name,
    pb.tagline,
    pb.logo_url,
    pb.logo_icon_url,
    pb.favicon_url,
    pb.primary_color,
    pb.primary_hover_color,
    pb.accent_color,
    pb.font_family,
    pb.font_url,
    pb.help_url,
    pb.support_email,
    pb.website_url,
    pb.privacy_url,
    pb.terms_url,
    pb.email_from_name,
    pb.email_from_address,
    pb.email_reply_to,
    pb.email_domain_verified,
    pb.tooltip_attribution,
    pb.custom_domain,
    pb.custom_domain_verified,
    FALSE as is_partner_branding
  FROM partner_branding pb
  WHERE pb.organization_id = p_org_id;

  -- If no branding found, return empty (caller will use defaults)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get branding for current user's active org
CREATE OR REPLACE FUNCTION get_current_user_branding()
RETURNS TABLE (
  branding_id UUID,
  display_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  logo_icon_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  primary_hover_color TEXT,
  accent_color TEXT,
  font_family TEXT,
  font_url TEXT,
  help_url TEXT,
  support_email TEXT,
  website_url TEXT,
  privacy_url TEXT,
  terms_url TEXT,
  email_from_name TEXT,
  email_from_address TEXT,
  email_reply_to TEXT,
  email_domain_verified BOOLEAN,
  tooltip_attribution TEXT,
  custom_domain TEXT,
  custom_domain_verified BOOLEAN,
  is_partner_branding BOOLEAN
) AS $$
DECLARE
  v_active_org_id UUID;
BEGIN
  -- Get user's active organization
  SELECT COALESCE(active_organization_id, organization_id) INTO v_active_org_id
  FROM users WHERE auth_user_id = auth.uid();

  IF v_active_org_id IS NULL THEN
    RETURN;  -- No active org, return empty
  END IF;

  -- Return branding for active org
  RETURN QUERY SELECT * FROM get_organization_branding(v_active_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if partner has branding configured
CREATE OR REPLACE FUNCTION partner_has_branding(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_home_org_id UUID;
BEGIN
  -- Get partner's home organization
  SELECT home_organization_id INTO v_home_org_id
  FROM users
  WHERE auth_user_id = p_auth_uid
  AND account_type = 'partner';

  IF v_home_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if branding exists
  RETURN EXISTS (
    SELECT 1 FROM partner_branding
    WHERE organization_id = v_home_org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create or update partner branding
CREATE OR REPLACE FUNCTION upsert_partner_branding(
  p_display_name TEXT,
  p_tagline TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_logo_icon_url TEXT DEFAULT NULL,
  p_favicon_url TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT '#b2ef63',
  p_primary_hover_color TEXT DEFAULT NULL,
  p_accent_color TEXT DEFAULT NULL,
  p_font_family TEXT DEFAULT NULL,
  p_font_url TEXT DEFAULT NULL,
  p_help_url TEXT DEFAULT NULL,
  p_support_email TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_privacy_url TEXT DEFAULT NULL,
  p_terms_url TEXT DEFAULT NULL,
  p_email_from_name TEXT DEFAULT NULL,
  p_email_from_address TEXT DEFAULT NULL,
  p_email_reply_to TEXT DEFAULT NULL,
  p_tooltip_attribution TEXT DEFAULT 'revguide'
)
RETURNS TABLE (
  success BOOLEAN,
  branding_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_home_org_id UUID;
  v_branding_id UUID;
  v_is_owner BOOLEAN;
BEGIN
  -- Get current user's home org
  SELECT u.id, u.home_organization_id INTO v_user_id, v_home_org_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  AND u.account_type = 'partner';

  IF v_home_org_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not a partner account or no home organization'::TEXT;
    RETURN;
  END IF;

  -- Verify user is owner or admin of home org
  SELECT (om.role IN ('owner', 'admin')) INTO v_is_owner
  FROM organization_members om
  WHERE om.user_id = v_user_id
  AND om.organization_id = v_home_org_id;

  IF NOT COALESCE(v_is_owner, FALSE) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Must be org owner or admin to manage branding'::TEXT;
    RETURN;
  END IF;

  -- Upsert branding
  INSERT INTO partner_branding (
    organization_id,
    display_name,
    tagline,
    logo_url,
    logo_icon_url,
    favicon_url,
    primary_color,
    primary_hover_color,
    accent_color,
    font_family,
    font_url,
    help_url,
    support_email,
    website_url,
    privacy_url,
    terms_url,
    email_from_name,
    email_from_address,
    email_reply_to,
    tooltip_attribution,
    updated_at
  ) VALUES (
    v_home_org_id,
    p_display_name,
    p_tagline,
    p_logo_url,
    p_logo_icon_url,
    p_favicon_url,
    p_primary_color,
    p_primary_hover_color,
    p_accent_color,
    p_font_family,
    p_font_url,
    p_help_url,
    p_support_email,
    p_website_url,
    p_privacy_url,
    p_terms_url,
    p_email_from_name,
    p_email_from_address,
    p_email_reply_to,
    p_tooltip_attribution,
    NOW()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    tagline = EXCLUDED.tagline,
    logo_url = EXCLUDED.logo_url,
    logo_icon_url = EXCLUDED.logo_icon_url,
    favicon_url = EXCLUDED.favicon_url,
    primary_color = EXCLUDED.primary_color,
    primary_hover_color = EXCLUDED.primary_hover_color,
    accent_color = EXCLUDED.accent_color,
    font_family = EXCLUDED.font_family,
    font_url = EXCLUDED.font_url,
    help_url = EXCLUDED.help_url,
    support_email = EXCLUDED.support_email,
    website_url = EXCLUDED.website_url,
    privacy_url = EXCLUDED.privacy_url,
    terms_url = EXCLUDED.terms_url,
    email_from_name = EXCLUDED.email_from_name,
    email_from_address = EXCLUDED.email_from_address,
    email_reply_to = EXCLUDED.email_reply_to,
    tooltip_attribution = EXCLUDED.tooltip_attribution,
    updated_at = NOW()
  RETURNING id INTO v_branding_id;

  RETURN QUERY SELECT TRUE, v_branding_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_organization_branding TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_branding TO authenticated;
GRANT EXECUTE ON FUNCTION partner_has_branding TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_partner_branding TO authenticated;

-- ============================================
-- 5. Update partner client org creation to inherit branding
-- ============================================

-- Update the create_client_organization function to link partner branding
CREATE OR REPLACE FUNCTION create_client_organization(
  p_client_name TEXT,
  p_portal_id TEXT DEFAULT NULL,
  p_portal_domain TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  organization_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_partner_user_id UUID;
  v_home_org_id UUID;
  v_new_org_id UUID;
  v_branding_id UUID;
BEGIN
  -- Get partner's home org
  SELECT u.id, u.home_organization_id INTO v_partner_user_id, v_home_org_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  AND u.account_type = 'partner';

  IF v_home_org_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not a partner account'::TEXT;
    RETURN;
  END IF;

  -- Check if partner has branding configured
  SELECT pb.id INTO v_branding_id
  FROM partner_branding pb
  WHERE pb.organization_id = v_home_org_id;

  -- Create new organization with partner branding linked
  INSERT INTO organizations (
    name,
    hubspot_portal_id,
    hubspot_portal_domain,
    partner_branding_id
  ) VALUES (
    p_client_name,
    p_portal_id,
    p_portal_domain,
    v_home_org_id  -- Link to partner's home org (not branding_id, see note below)
  )
  RETURNING id INTO v_new_org_id;

  -- Note: We store the partner's org ID in partner_branding_id so branding lookup works
  -- even if partner hasn't configured branding yet. When they do configure it,
  -- all client orgs automatically get it.

  -- Add partner to org with partner role
  INSERT INTO organization_members (user_id, organization_id, role, joined_at)
  VALUES (v_partner_user_id, v_new_org_id, 'partner', NOW());

  RETURN QUERY SELECT TRUE, v_new_org_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Handle branding removal on partner access revocation
-- ============================================

-- Function to clear partner branding when partner access is revoked
CREATE OR REPLACE FUNCTION clear_partner_branding_on_revoke()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act on partner role deletions
  IF OLD.role = 'partner' THEN
    -- Check if the org's partner_branding_id matches the partner's home org
    UPDATE organizations
    SET partner_branding_id = NULL
    WHERE id = OLD.organization_id
    AND partner_branding_id = (
      SELECT home_organization_id FROM users WHERE id = OLD.user_id
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS clear_branding_on_partner_revoke ON organization_members;
CREATE TRIGGER clear_branding_on_partner_revoke
  AFTER DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION clear_partner_branding_on_revoke();

-- ============================================
-- 7. Add updated_at trigger
-- ============================================

DROP TRIGGER IF EXISTS partner_branding_updated_at ON partner_branding;
CREATE TRIGGER partner_branding_updated_at
  BEFORE UPDATE ON partner_branding
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New table:
--   - partner_branding: Stores white-label configuration
--
-- New columns:
--   - organizations.partner_branding_id: Links client org to partner's branding
--
-- New functions:
--   - get_organization_branding(): Resolve branding for any org
--   - get_current_user_branding(): Get branding for current user's active org
--   - partner_has_branding(): Check if partner has configured branding
--   - upsert_partner_branding(): Create or update branding
--
-- Updated functions:
--   - create_client_organization(): Now links partner branding to new client orgs
--
-- New trigger:
--   - clear_branding_on_partner_revoke: Clears branding link when partner removed
--
-- RLS policies:
--   - Partners can manage their own branding
--   - Users can read branding linked to their org
--
