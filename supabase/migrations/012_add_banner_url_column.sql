-- Migration: Add url column to banners table
--
-- The banners table already has embed_url (converted URL for iframes),
-- but was missing the original url column that stores the user's input URL.
--
-- Run this in Supabase SQL Editor

-- Add url column for storing the original embed URL (before conversion)
ALTER TABLE banners ADD COLUMN IF NOT EXISTS url TEXT;
