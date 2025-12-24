-- Migration: Recommended Content Play Type
--
-- This migration adds support for "Recommended Content" as a new play type.
-- Content assets can be linked to plays via a junction table, allowing
-- plays to bundle multiple assets with shared rules/conditions.
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Play Content Assets Junction Table
-- ============================================

CREATE TABLE IF NOT EXISTS play_content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  content_asset_id UUID NOT NULL REFERENCES recommended_content(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(play_id, content_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_play_content_assets_play ON play_content_assets(play_id);
CREATE INDEX IF NOT EXISTS idx_play_content_assets_content ON play_content_assets(content_asset_id);
CREATE INDEX IF NOT EXISTS idx_play_content_assets_order ON play_content_assets(play_id, display_order);

COMMENT ON TABLE play_content_assets IS 'Junction table linking plays to content assets for Recommended Content play type';
COMMENT ON COLUMN play_content_assets.display_order IS 'Order in which assets appear within the play (0-indexed)';

-- ============================================
-- 2. Enable RLS
-- ============================================

ALTER TABLE play_content_assets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies
-- ============================================

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view play_content_assets" ON play_content_assets;
DROP POLICY IF EXISTS "Editors can create play_content_assets" ON play_content_assets;
DROP POLICY IF EXISTS "Editors can update play_content_assets" ON play_content_assets;
DROP POLICY IF EXISTS "Editors can delete play_content_assets" ON play_content_assets;
DROP POLICY IF EXISTS "Service role can manage play_content_assets" ON play_content_assets;

-- Policy: Users can view play_content_assets for plays in their org or partner orgs
CREATE POLICY "Users can view play_content_assets" ON play_content_assets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plays p
      WHERE p.id = play_content_assets.play_id
      AND (
        p.organization_id = get_user_organization_id(auth.uid())
        OR check_user_can_edit_org_content(auth.uid(), p.organization_id)
      )
    )
  );

-- Policy: Editors, admins, and partners can create play_content_assets
CREATE POLICY "Editors can create play_content_assets" ON play_content_assets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plays p
      WHERE p.id = play_content_assets.play_id
      AND check_user_can_edit_org_content(auth.uid(), p.organization_id)
    )
  );

-- Policy: Editors, admins, and partners can update play_content_assets
CREATE POLICY "Editors can update play_content_assets" ON play_content_assets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM plays p
      WHERE p.id = play_content_assets.play_id
      AND check_user_can_edit_org_content(auth.uid(), p.organization_id)
    )
  );

-- Policy: Editors, admins, and partners can delete play_content_assets
CREATE POLICY "Editors can delete play_content_assets" ON play_content_assets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM plays p
      WHERE p.id = play_content_assets.play_id
      AND check_user_can_edit_org_content(auth.uid(), p.organization_id)
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role can manage play_content_assets" ON play_content_assets
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Grant permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON play_content_assets TO authenticated;

-- ============================================
-- Summary
-- ============================================
-- Created junction table play_content_assets to link plays to content assets.
-- This enables the "Recommended Content" play type where:
--   - card_type = 'recommended_content' on the plays table
--   - Assets selected from recommended_content table via this junction
--   - Rules/conditions defined on the play, not on individual assets
--   - Assets rendered in order specified by display_order
