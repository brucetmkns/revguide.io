-- Migration 022: Create unified cards table
-- Consolidates wiki_entries, banners, and plays into a single content system

CREATE TABLE IF NOT EXISTS cards (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Card Type (determines behavior and available fields)
  card_type TEXT NOT NULL CHECK (card_type IN ('definition', 'alert', 'battlecard', 'asset')),

  -- Common Fields
  name TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,

  -- Content
  content TEXT,                          -- Rich text (definition/message/overview)
  link TEXT,                             -- External documentation link
  sections JSONB DEFAULT '[]',           -- For battlecards: [{type, title, content/mediaUrl/fields}]

  -- Display Configuration
  display_modes TEXT[] DEFAULT '{}',     -- ['tooltip', 'banner', 'sidepanel', 'callout']
  priority INTEGER DEFAULT 50,
  enabled BOOLEAN DEFAULT TRUE,

  -- Triggers (for tooltip display mode)
  trigger_text TEXT,
  aliases TEXT[] DEFAULT '{}',
  match_type TEXT DEFAULT 'exact',       -- 'exact', 'starts_with', 'contains'
  frequency TEXT DEFAULT 'first',        -- 'first', 'all'
  include_aliases BOOLEAN DEFAULT TRUE,
  page_type TEXT DEFAULT 'record',       -- 'record', 'index', 'any'
  url_patterns JSONB,                    -- URL glob patterns

  -- Categorization
  category TEXT DEFAULT 'general',       -- general, sales, marketing, product, process, field
  object_types TEXT[] DEFAULT '{}',      -- ['contacts', 'companies', 'deals', 'tickets']
  property_group TEXT,                   -- For field definitions (HubSpot property group)

  -- Rules (for banner/sidepanel display modes)
  conditions JSONB DEFAULT '[]',         -- [{property, operator, value}]
  logic TEXT DEFAULT 'AND',              -- 'AND', 'OR'
  display_on_all BOOLEAN DEFAULT FALSE,

  -- Banner-specific
  banner_type TEXT,                      -- 'info', 'success', 'warning', 'error', 'embed'
  embed_url TEXT,                        -- Converted embed URL for iframes
  original_url TEXT,                     -- Original URL before conversion
  tab_visibility TEXT DEFAULT 'all',     -- 'all', '1', '2', '3', etc.

  -- Battlecard-specific
  battlecard_type TEXT,                  -- 'competitor', 'objection', 'tip', 'process'

  -- Asset curation (new features)
  assets JSONB DEFAULT '[]',             -- [{url, title, type, description}]
  next_steps JSONB DEFAULT '[]',         -- [{text, link?, completed?}]

  -- Relationships
  related_card_ids UUID[] DEFAULT '{}',
  parent_id UUID REFERENCES cards(id) ON DELETE SET NULL,

  -- Legacy reference (for migration tracking)
  legacy_type TEXT,                      -- 'wiki', 'banner', 'play'
  legacy_id TEXT,                        -- Original ID from legacy table

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_cards_organization ON cards(organization_id);
CREATE INDEX idx_cards_type ON cards(card_type);
CREATE INDEX idx_cards_enabled ON cards(organization_id, enabled) WHERE enabled = TRUE;
CREATE INDEX idx_cards_trigger ON cards(organization_id, trigger_text) WHERE trigger_text IS NOT NULL;
CREATE INDEX idx_cards_display_modes ON cards USING GIN(display_modes);
CREATE INDEX idx_cards_object_types ON cards USING GIN(object_types);
CREATE INDEX idx_cards_legacy ON cards(legacy_type, legacy_id) WHERE legacy_type IS NOT NULL;
CREATE INDEX idx_cards_priority ON cards(organization_id, priority DESC);

-- Enable Row Level Security
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view cards in organizations they belong to
CREATE POLICY "cards_select_policy" ON cards
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Editors, admins, and owners can insert cards
CREATE POLICY "cards_insert_policy" ON cards
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
    )
  );

-- Policy: Editors, admins, and owners can update cards
CREATE POLICY "cards_update_policy" ON cards
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
    )
  );

-- Policy: Editors, admins, and owners can delete cards
CREATE POLICY "cards_delete_policy" ON cards
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
    )
  );

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_updated_at_trigger
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION update_cards_updated_at();

-- Add comment for documentation
COMMENT ON TABLE cards IS 'Unified content cards - consolidates wiki_entries, banners, and plays';
COMMENT ON COLUMN cards.card_type IS 'Card type: definition (wiki), alert (banner), battlecard (play), asset (new)';
COMMENT ON COLUMN cards.display_modes IS 'Array of display modes: tooltip, banner, sidepanel, callout';
COMMENT ON COLUMN cards.legacy_type IS 'Source table for migrated data: wiki, banner, play';
COMMENT ON COLUMN cards.legacy_id IS 'Original ID from source table for migration tracking';
