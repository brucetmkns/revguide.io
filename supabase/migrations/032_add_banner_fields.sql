-- Add fields column to banners table for editable HubSpot properties
-- Fields array structure: [{property, label, type, fieldType, required, options}]
ALTER TABLE banners ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb;
