-- Add show_on_index column to banners table
-- This controls whether a banner displays as a tag on index/list pages

ALTER TABLE banners ADD COLUMN IF NOT EXISTS show_on_index BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN banners.show_on_index IS 'When true, displays this banner as a clickable tag on record index/list pages';
