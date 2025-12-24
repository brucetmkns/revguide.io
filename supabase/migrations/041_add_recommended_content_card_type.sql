-- Migration: Add recommended_content to plays card_type constraint
--
-- The plays table has a CHECK constraint limiting card_type values.
-- This adds 'recommended_content' as an allowed type.
--
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE plays DROP CONSTRAINT IF EXISTS plays_card_type_check;

-- Add the new constraint with recommended_content included
ALTER TABLE plays ADD CONSTRAINT plays_card_type_check
  CHECK (card_type IN ('competitor', 'objection', 'tip', 'process', 'recommended_content'));

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'plays_card_type_check';
