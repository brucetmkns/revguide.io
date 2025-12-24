-- Add condition groups support for banners and plays
-- Allows grouping conditions with AND/OR logic between groups

-- Add condition_groups and group_logic to banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS condition_groups JSONB;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS group_logic TEXT DEFAULT 'AND';

-- Add condition_groups and group_logic to plays
ALTER TABLE plays ADD COLUMN IF NOT EXISTS condition_groups JSONB;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS group_logic TEXT DEFAULT 'AND';

-- Add comments for documentation
COMMENT ON COLUMN banners.condition_groups IS 'Array of condition groups, each with id, logic, and conditions array';
COMMENT ON COLUMN banners.group_logic IS 'Logic to combine condition groups: AND or OR';
COMMENT ON COLUMN plays.condition_groups IS 'Array of condition groups, each with id, logic, and conditions array';
COMMENT ON COLUMN plays.group_logic IS 'Logic to combine condition groups: AND or OR';
