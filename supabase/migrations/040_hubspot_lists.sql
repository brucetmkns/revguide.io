-- Migration: HubSpot Lists for List Membership Conditions
--
-- Stores synced HubSpot lists to enable "is member of list" conditions
-- for plays, banners, and recommendations.
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. HubSpot Lists Table
-- ============================================

CREATE TABLE IF NOT EXISTS hubspot_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES hubspot_connections(id) ON DELETE SET NULL,
  list_id TEXT NOT NULL,                    -- HubSpot's ILS list ID (e.g., "ILS-123")
  name TEXT NOT NULL,                       -- List name for display
  object_type TEXT NOT NULL DEFAULT 'CONTACT', -- 'CONTACT', 'COMPANY', 'DEAL'
  list_type TEXT,                           -- 'STATIC', 'DYNAMIC', etc.
  size INTEGER DEFAULT 0,                   -- Number of records in list
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_hubspot_lists_org ON hubspot_lists(organization_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_lists_object_type ON hubspot_lists(organization_id, object_type);

COMMENT ON TABLE hubspot_lists IS 'Synced HubSpot lists for list membership conditions';
COMMENT ON COLUMN hubspot_lists.list_id IS 'HubSpot ILS list ID (e.g., ILS-123)';
COMMENT ON COLUMN hubspot_lists.object_type IS 'Object type: CONTACT, COMPANY, DEAL';

-- ============================================
-- 2. Enable RLS
-- ============================================

ALTER TABLE hubspot_lists ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies
-- ============================================

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view hubspot_lists" ON hubspot_lists;
DROP POLICY IF EXISTS "Editors can create hubspot_lists" ON hubspot_lists;
DROP POLICY IF EXISTS "Editors can update hubspot_lists" ON hubspot_lists;
DROP POLICY IF EXISTS "Editors can delete hubspot_lists" ON hubspot_lists;
DROP POLICY IF EXISTS "Service role can manage hubspot_lists" ON hubspot_lists;

-- Policy: Users can view lists for their org or partner orgs
CREATE POLICY "Users can view hubspot_lists" ON hubspot_lists
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
    OR check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can create lists
CREATE POLICY "Editors can create hubspot_lists" ON hubspot_lists
  FOR INSERT WITH CHECK (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can update lists
CREATE POLICY "Editors can update hubspot_lists" ON hubspot_lists
  FOR UPDATE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Editors, admins, and partners can delete lists
CREATE POLICY "Editors can delete hubspot_lists" ON hubspot_lists
  FOR DELETE USING (
    check_user_can_edit_org_content(auth.uid(), organization_id)
  );

-- Policy: Service role has full access
CREATE POLICY "Service role can manage hubspot_lists" ON hubspot_lists
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. Grant permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON hubspot_lists TO authenticated;

-- ============================================
-- Summary
-- ============================================
-- Created hubspot_lists table to store synced HubSpot lists.
-- This enables "is member of list" conditions in plays/banners by:
--   1. Syncing list metadata from HubSpot API
--   2. Providing a dropdown of available lists in condition UI
--   3. Checking list membership at runtime via separate API call
