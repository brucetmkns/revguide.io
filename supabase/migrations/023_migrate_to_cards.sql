-- Migration 023: Functions to migrate legacy data to unified cards table
-- Run these functions to migrate existing wiki_entries, banners, and plays

-- Migrate wiki_entries to cards (type: definition)
CREATE OR REPLACE FUNCTION migrate_wiki_to_cards(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO cards (
    organization_id,
    card_type,
    name,
    title,
    content,
    link,
    display_modes,
    priority,
    enabled,
    trigger_text,
    aliases,
    match_type,
    frequency,
    include_aliases,
    page_type,
    url_patterns,
    category,
    object_types,
    property_group,
    legacy_type,
    legacy_id,
    created_at,
    updated_at
  )
  SELECT
    w.organization_id,
    'definition',
    COALESCE(w.title, w.trigger),
    w.title,
    w.definition,
    w.link,
    ARRAY['tooltip'],
    COALESCE(w.priority, 50),
    COALESCE(w.enabled, TRUE),
    w.trigger,
    COALESCE(w.aliases, '[]')::TEXT[],
    COALESCE(w.match_type, 'exact'),
    COALESCE(w.frequency, 'first'),
    COALESCE(w.include_aliases, TRUE),
    COALESCE(w.page_type, 'record'),
    w.url_patterns,
    COALESCE(w.category, 'general'),
    CASE WHEN w.object_type IS NOT NULL THEN ARRAY[w.object_type] ELSE '{}' END,
    w.property_group,
    'wiki',
    w.id::TEXT,
    w.created_at,
    w.updated_at
  FROM wiki_entries w
  WHERE w.organization_id = p_org_id
  AND NOT EXISTS (
    SELECT 1 FROM cards c
    WHERE c.legacy_type = 'wiki'
    AND c.legacy_id = w.id::TEXT
    AND c.organization_id = p_org_id
  );

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate banners to cards (type: alert)
CREATE OR REPLACE FUNCTION migrate_banners_to_cards(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO cards (
    organization_id,
    card_type,
    name,
    title,
    content,
    display_modes,
    priority,
    enabled,
    category,
    object_types,
    conditions,
    logic,
    display_on_all,
    banner_type,
    embed_url,
    original_url,
    tab_visibility,
    related_card_ids,
    legacy_type,
    legacy_id,
    created_at,
    updated_at
  )
  SELECT
    b.organization_id,
    'alert',
    COALESCE(b.name, b.title, 'Untitled Banner'),
    b.title,
    b.message,
    ARRAY['banner'],
    COALESCE(b.priority, 0),
    COALESCE(b.enabled, TRUE),
    'general',
    CASE
      WHEN b.object_type IS NOT NULL THEN ARRAY[b.object_type]
      WHEN b.object_types IS NOT NULL THEN (
        SELECT ARRAY_AGG(elem::TEXT)
        FROM jsonb_array_elements_text(b.object_types) AS elem
      )
      ELSE '{}'
    END,
    COALESCE(b.conditions, '[]'),
    COALESCE(b.logic, 'AND'),
    COALESCE(b.display_on_all, FALSE),
    COALESCE(b.type, 'info'),
    b.embed_url,
    b.url,
    COALESCE(b.tab_visibility, 'all'),
    CASE
      WHEN b.related_play_id IS NOT NULL THEN ARRAY[b.related_play_id]
      ELSE '{}'
    END,
    'banner',
    b.id::TEXT,
    b.created_at,
    b.updated_at
  FROM banners b
  WHERE b.organization_id = p_org_id
  AND NOT EXISTS (
    SELECT 1 FROM cards c
    WHERE c.legacy_type = 'banner'
    AND c.legacy_id = b.id::TEXT
    AND c.organization_id = p_org_id
  );

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate plays to cards (type: battlecard)
CREATE OR REPLACE FUNCTION migrate_plays_to_cards(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO cards (
    organization_id,
    card_type,
    name,
    title,
    subtitle,
    link,
    sections,
    display_modes,
    priority,
    enabled,
    category,
    object_types,
    conditions,
    logic,
    display_on_all,
    battlecard_type,
    legacy_type,
    legacy_id,
    created_at,
    updated_at
  )
  SELECT
    p.organization_id,
    'battlecard',
    COALESCE(p.name, 'Untitled Play'),
    p.name,
    p.subtitle,
    p.link,
    COALESCE(p.sections, '[]'),
    ARRAY['sidepanel'],
    50,
    TRUE,
    'sales',
    CASE WHEN p.object_type IS NOT NULL THEN ARRAY[p.object_type] ELSE '{}' END,
    COALESCE(p.conditions, '[]'),
    COALESCE(p.logic, 'AND'),
    COALESCE(p.display_on_all, FALSE),
    COALESCE(p.card_type, 'tip'),
    'play',
    p.id::TEXT,
    p.created_at,
    p.updated_at
  FROM plays p
  WHERE p.organization_id = p_org_id
  AND NOT EXISTS (
    SELECT 1 FROM cards c
    WHERE c.legacy_type = 'play'
    AND c.legacy_id = p.id::TEXT
    AND c.organization_id = p_org_id
  );

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master migration function - migrates all content types for an organization
CREATE OR REPLACE FUNCTION migrate_all_to_cards(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  wiki_count INTEGER;
  banner_count INTEGER;
  play_count INTEGER;
BEGIN
  -- Migrate each type
  SELECT migrate_wiki_to_cards(p_org_id) INTO wiki_count;
  SELECT migrate_banners_to_cards(p_org_id) INTO banner_count;
  SELECT migrate_plays_to_cards(p_org_id) INTO play_count;

  -- Return summary
  RETURN jsonb_build_object(
    'wiki', wiki_count,
    'banners', banner_count,
    'plays', play_count,
    'total', wiki_count + banner_count + play_count,
    'organization_id', p_org_id,
    'migrated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check migration status for an organization
CREATE OR REPLACE FUNCTION check_cards_migration_status(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  cards_count INTEGER;
  wiki_count INTEGER;
  banner_count INTEGER;
  play_count INTEGER;
  migrated_wiki INTEGER;
  migrated_banners INTEGER;
  migrated_plays INTEGER;
BEGIN
  -- Count current cards
  SELECT COUNT(*) INTO cards_count FROM cards WHERE organization_id = p_org_id;

  -- Count legacy items
  SELECT COUNT(*) INTO wiki_count FROM wiki_entries WHERE organization_id = p_org_id;
  SELECT COUNT(*) INTO banner_count FROM banners WHERE organization_id = p_org_id;
  SELECT COUNT(*) INTO play_count FROM plays WHERE organization_id = p_org_id;

  -- Count already migrated
  SELECT COUNT(*) INTO migrated_wiki FROM cards WHERE organization_id = p_org_id AND legacy_type = 'wiki';
  SELECT COUNT(*) INTO migrated_banners FROM cards WHERE organization_id = p_org_id AND legacy_type = 'banner';
  SELECT COUNT(*) INTO migrated_plays FROM cards WHERE organization_id = p_org_id AND legacy_type = 'play';

  RETURN jsonb_build_object(
    'cards_total', cards_count,
    'legacy_wiki', wiki_count,
    'legacy_banners', banner_count,
    'legacy_plays', play_count,
    'migrated_wiki', migrated_wiki,
    'migrated_banners', migrated_banners,
    'migrated_plays', migrated_plays,
    'pending_wiki', wiki_count - migrated_wiki,
    'pending_banners', banner_count - migrated_banners,
    'pending_plays', play_count - migrated_plays,
    'is_complete', (wiki_count = migrated_wiki AND banner_count = migrated_banners AND play_count = migrated_plays)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update related_card_ids to point to new card IDs after migration
-- Run this after migrate_all_to_cards to fix cross-references
CREATE OR REPLACE FUNCTION fix_card_relationships(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  card_record RECORD;
  old_play_id UUID;
  new_card_id UUID;
BEGIN
  -- Find cards with legacy play references and update to new card IDs
  FOR card_record IN
    SELECT c.id, c.related_card_ids
    FROM cards c
    WHERE c.organization_id = p_org_id
    AND c.related_card_ids != '{}'
  LOOP
    -- For each related_card_id, check if it's a legacy play ID and update
    FOREACH old_play_id IN ARRAY card_record.related_card_ids
    LOOP
      -- Find the new card ID for this legacy play
      SELECT id INTO new_card_id
      FROM cards
      WHERE legacy_type = 'play'
      AND legacy_id = old_play_id::TEXT
      AND organization_id = p_org_id;

      IF new_card_id IS NOT NULL AND new_card_id != old_play_id THEN
        -- Update the reference
        UPDATE cards
        SET related_card_ids = array_replace(related_card_ids, old_play_id, new_card_id)
        WHERE id = card_record.id;

        updated_count := updated_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION migrate_wiki_to_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_banners_to_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_plays_to_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_all_to_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_cards_migration_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fix_card_relationships(UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION migrate_all_to_cards IS 'Migrates all wiki_entries, banners, and plays to the unified cards table';
COMMENT ON FUNCTION check_cards_migration_status IS 'Returns migration status for an organization';
