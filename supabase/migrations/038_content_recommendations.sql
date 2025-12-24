-- Migration: Content Recommendations Feature
--
-- This migration adds support for tag-based and direct-condition content recommendations.
-- Content can match via:
--   1. Tag-based matching: Tag rules output tags, content with matching tags shown
--   2. Direct conditions: Per-asset conditions evaluated against record properties
--   3. Hybrid: Both tags AND conditions for fine-grained control
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Content Tags Table
-- ============================================

CREATE TABLE IF NOT EXISTS content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_content_tags_org ON content_tags(organization_id);

COMMENT ON TABLE content_tags IS 'Organization-scoped tags for content classification and matching';
COMMENT ON COLUMN content_tags.slug IS 'Lowercase URL-safe identifier, unique per org';
COMMENT ON COLUMN content_tags.color IS 'Hex color for UI display badges';

-- ============================================
-- 2. Tag Rules Table
-- ============================================

CREATE TABLE IF NOT EXISTS tag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Targeting (same pattern as banners/plays)
  object_types TEXT[] DEFAULT '{}',
  pipelines TEXT[] DEFAULT '{}',
  stages TEXT[] DEFAULT '{}',

  -- Condition system (reuses existing pattern)
  conditions JSONB DEFAULT '[]',
  logic TEXT DEFAULT 'AND',
  condition_groups JSONB,
  group_logic TEXT DEFAULT 'AND',

  -- Output tags (array of tag IDs that activate when rule matches)
  output_tag_ids UUID[] DEFAULT '{}',

  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tag_rules_org ON tag_rules(organization_id);
CREATE INDEX idx_tag_rules_enabled ON tag_rules(organization_id) WHERE enabled = TRUE;

COMMENT ON TABLE tag_rules IS 'Rules that output tags when conditions match record properties';
COMMENT ON COLUMN tag_rules.output_tag_ids IS 'Array of content_tags.id values to activate when rule matches';
COMMENT ON COLUMN tag_rules.conditions IS 'Array of {property, operator, value} condition objects';
COMMENT ON COLUMN tag_rules.condition_groups IS 'Array of condition groups with nested AND/OR logic';

-- ============================================
-- 3. Recommended Content Table
-- ============================================

CREATE TABLE IF NOT EXISTS recommended_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Content type
  content_type TEXT NOT NULL DEFAULT 'external_link' CHECK (content_type IN (
    'external_link',
    'hubspot_document',
    'hubspot_sequence'
  )),

  -- Display info
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,

  -- Type-specific data
  url TEXT,
  hubspot_document_id TEXT,
  hubspot_sequence_id TEXT,
  hubspot_metadata JSONB,

  -- Tag-based matching (can be empty if using direct conditions only)
  tag_ids UUID[] DEFAULT '{}',

  -- Direct conditions (can be empty if using tags only)
  -- Content matches if EITHER tags match OR direct conditions match
  object_types TEXT[] DEFAULT '{}',
  pipelines TEXT[] DEFAULT '{}',
  stages TEXT[] DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  logic TEXT DEFAULT 'AND',
  condition_groups JSONB,
  group_logic TEXT DEFAULT 'AND',
  display_on_all BOOLEAN DEFAULT FALSE,

  -- Display options
  category TEXT,
  priority INTEGER DEFAULT 0,
  open_in_new_tab BOOLEAN DEFAULT TRUE,
  enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recommended_content_org ON recommended_content(organization_id);
CREATE INDEX idx_recommended_content_type ON recommended_content(organization_id, content_type);
CREATE INDEX idx_recommended_content_tags ON recommended_content USING GIN (tag_ids);
CREATE INDEX idx_recommended_content_enabled ON recommended_content(organization_id) WHERE enabled = TRUE;

COMMENT ON TABLE recommended_content IS 'Content assets to recommend based on tag or condition matching';
COMMENT ON COLUMN recommended_content.content_type IS 'Type of content: external_link, hubspot_document, or hubspot_sequence';
COMMENT ON COLUMN recommended_content.tag_ids IS 'Array of content_tags.id values - content shown if any tag is active';
COMMENT ON COLUMN recommended_content.display_on_all IS 'If true, show on all records regardless of conditions';
COMMENT ON COLUMN recommended_content.category IS 'Optional grouping category for sidepanel display';

-- ============================================
-- 4. Enable RLS
-- ============================================

ALTER TABLE content_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommended_content ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Content Tags RLS Policies
-- ============================================

-- Policy: Users can view tags for their org OR orgs they're a partner of
CREATE POLICY "Users can view org content_tags" ON content_tags
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create tags
CREATE POLICY "Editors can create content_tags" ON content_tags
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update tags
CREATE POLICY "Editors can update content_tags" ON content_tags
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete tags
CREATE POLICY "Editors can delete content_tags" ON content_tags
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Service role has full access
CREATE POLICY "Service role can manage content_tags" ON content_tags
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 6. Tag Rules RLS Policies
-- ============================================

-- Policy: Users can view tag rules for their org OR orgs they're a partner of
CREATE POLICY "Users can view org tag_rules" ON tag_rules
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create tag rules
CREATE POLICY "Editors can create tag_rules" ON tag_rules
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update tag rules
CREATE POLICY "Editors can update tag_rules" ON tag_rules
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete tag rules
CREATE POLICY "Editors can delete tag_rules" ON tag_rules
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Service role has full access
CREATE POLICY "Service role can manage tag_rules" ON tag_rules
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. Recommended Content RLS Policies
-- ============================================

-- Policy: Users can view content for their org OR orgs they're a partner of
CREATE POLICY "Users can view org recommended_content" ON recommended_content
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create content
CREATE POLICY "Editors can create recommended_content" ON recommended_content
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update content
CREATE POLICY "Editors can update recommended_content" ON recommended_content
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete content
CREATE POLICY "Editors can delete recommended_content" ON recommended_content
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Service role has full access
CREATE POLICY "Service role can manage recommended_content" ON recommended_content
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 8. Grant permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON content_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tag_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recommended_content TO authenticated;

-- ============================================
-- Summary
-- ============================================
-- Created 3 new tables:
--   - content_tags: Organization-scoped tags for classification
--   - tag_rules: Rules that output tags when conditions match
--   - recommended_content: Content assets with tag and/or condition matching
--
-- Content matching logic:
--   - Content shows if ANY of its tags are active (via tag rules)
--   - OR if its direct conditions match the current record
--   - OR if display_on_all is true
--
-- RLS follows existing pattern from migration 030
