-- Migration: Add ERP Connection Configuration
-- Adds erp_config JSONB column to organizations for external ERP system integration display
--
-- erp_config structure:
-- {
--   "enabled": boolean,
--   "erp_name": string,
--   "icon": string (data URI),
--   "field_mappings": {
--     "company": { "field": string, "url_template": string },
--     "deal": { "field": string, "url_template": string },
--     "contact": { "field": string, "url_template": string },
--     "ticket": { "field": string, "url_template": string }
--   }
-- }

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS erp_config JSONB DEFAULT NULL;

COMMENT ON COLUMN organizations.erp_config IS 'ERP integration config: {enabled, erp_name, icon (data URI), field_mappings:{object_type:{field,url_template}}}';
