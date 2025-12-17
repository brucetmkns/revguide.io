-- Add missing columns to plays table
ALTER TABLE plays ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS display_on_all BOOLEAN DEFAULT false;

-- Add missing columns to banners table
ALTER TABLE banners ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS object_types JSONB;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS display_on_all BOOLEAN DEFAULT false;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS tab_visibility TEXT DEFAULT 'all';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS related_play_id UUID REFERENCES plays(id);
ALTER TABLE banners ADD COLUMN IF NOT EXISTS embed_url TEXT;

-- Add missing columns to wiki_entries table
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS property_group TEXT;
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS match_type TEXT DEFAULT 'exact';
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'first';
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS include_aliases BOOLEAN DEFAULT true;
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50;
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'record';
ALTER TABLE wiki_entries ADD COLUMN IF NOT EXISTS url_patterns JSONB;
