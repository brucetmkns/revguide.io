-- Migration: Update billing to per-seat pricing model
--
-- Changes:
-- - Adds price_per_seat and free_seat_threshold columns
-- - Removes included_seats, max_seats, price_per_extra_seat columns
-- - Updates plan_limits with new pricing structure
-- - Renames 'free' plan to 'starter'

-- ============================================
-- 1. Add new columns to plan_limits
-- ============================================

ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS price_per_seat INTEGER DEFAULT 0;
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS free_seat_threshold INTEGER DEFAULT 0;

-- ============================================
-- 2. Drop old columns (if they exist)
-- ============================================

ALTER TABLE plan_limits DROP COLUMN IF EXISTS included_seats;
ALTER TABLE plan_limits DROP COLUMN IF EXISTS max_seats;
ALTER TABLE plan_limits DROP COLUMN IF EXISTS price_per_extra_seat;

-- ============================================
-- 3. Update plan data
-- ============================================

-- Delete old plan configurations
DELETE FROM plan_limits;

-- Insert new plan configurations
-- Standard plans: per-seat pricing
-- Partner plans: flat monthly pricing
INSERT INTO plan_limits (plan_type, display_name, is_partner_plan, banner_limit, wiki_limit, play_limit, price_per_seat, free_seat_threshold, client_portal_limit, library_limit, price_monthly, price_yearly) VALUES
  -- Standard plans (per-seat)
  ('starter', 'Starter', FALSE, 5, 10, 3, 500, 5, NULL, NULL, 0, 0),           -- $5/seat, free ≤5 users
  ('pro', 'Pro', FALSE, -1, -1, -1, 1000, 0, NULL, NULL, 0, 0),                -- $10/seat, unlimited content
  ('business', 'Business', FALSE, -1, -1, -1, 2000, 0, NULL, NULL, 0, 0),      -- $20/seat, unlimited content
  -- Partner plans (flat monthly)
  ('partner_starter', 'Partner Starter', TRUE, -1, -1, -1, 0, 0, 5, -1, 50000, 500000),      -- $500/mo, 5 portals
  ('partner_pro', 'Partner Pro', TRUE, -1, -1, -1, 0, 0, 20, -1, 125000, 1250000),           -- $1,250/mo, 20 portals
  ('partner_enterprise', 'Partner Enterprise', TRUE, -1, -1, -1, 0, 0, -1, -1, 250000, 2500000);  -- $2,500/mo, unlimited

-- ============================================
-- 4. Update any existing subscriptions from 'free' to 'starter'
-- ============================================

UPDATE subscriptions SET plan_type = 'starter' WHERE plan_type = 'free';
