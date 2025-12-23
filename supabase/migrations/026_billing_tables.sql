-- Migration: Billing & Subscription System
--
-- This migration adds Stripe billing integration with:
-- 1. Subscription tracking table linked to organizations
-- 2. Usage counting for feature limits (banners, wiki, plays)
-- 3. Billing event log for webhook audit trail
-- 4. Plan limits configuration
-- 5. RPC functions for subscription queries
--
-- Pricing Model (Per-Seat):
-- Standard Plans:
-- - Starter: Free for ≤5 users, $5/seat/month for 6+ (pays for ALL seats)
-- - Pro: $10/seat/month (unlimited content)
-- - Business: $20/seat/month (unlimited content, priority support)
--
-- Partner Plans (Tiered):
-- - Partner Starter: $500/month (5 client portals)
-- - Partner Pro: $1,250/month (20 client portals)
-- - Partner Enterprise: $2,500/month (unlimited portals)
-- Partners get free viewer seats for all client accounts

-- ============================================
-- 1. Plan Limits Configuration Table
-- ============================================

CREATE TABLE IF NOT EXISTS plan_limits (
  plan_type TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_partner_plan BOOLEAN DEFAULT FALSE,

  -- Content limits (-1 = unlimited)
  banner_limit INTEGER NOT NULL DEFAULT 5,
  wiki_limit INTEGER NOT NULL DEFAULT 10,
  play_limit INTEGER NOT NULL DEFAULT 3,

  -- Per-seat pricing (cents/month)
  price_per_seat INTEGER DEFAULT 0,
  free_seat_threshold INTEGER DEFAULT 0,  -- Seats that are free (Starter: 5)

  -- Partner-specific limits
  client_portal_limit INTEGER DEFAULT NULL,  -- NULL for standard plans
  library_limit INTEGER DEFAULT NULL,

  -- Flat pricing for partner plans (cents)
  price_monthly INTEGER DEFAULT 0,
  price_yearly INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert plan configurations
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
  ('partner_enterprise', 'Partner Enterprise', TRUE, -1, -1, -1, 0, 0, -1, -1, 250000, 2500000)  -- $2,500/mo, unlimited
ON CONFLICT (plan_type) DO NOTHING;

-- ============================================
-- 2. Subscriptions Table
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Stripe identifiers
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,

  -- Plan details
  plan_type TEXT NOT NULL DEFAULT 'free' REFERENCES plan_limits(plan_type),
  billing_interval TEXT CHECK (billing_interval IN ('month', 'year')),

  -- Seat management
  seat_count INTEGER NOT NULL DEFAULT 1,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',        -- Subscription is active and paid
    'past_due',      -- Payment failed but within grace period
    'canceled',      -- Subscription canceled
    'paused',        -- Subscription paused (not currently used)
    'trialing',      -- Trial period (not used in freemium model)
    'grace_period',  -- Payment failed, grace period countdown
    'restricted'     -- Grace period expired, read-only mode
  )),

  -- Grace period tracking
  payment_failed_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_period ON subscriptions(grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- ============================================
-- 3. Usage Counts Table (Cached)
-- ============================================

CREATE TABLE IF NOT EXISTS usage_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Content counts (cached, synced periodically)
  banner_count INTEGER NOT NULL DEFAULT 0,
  wiki_count INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,

  -- Team count
  member_count INTEGER NOT NULL DEFAULT 1,

  -- Partner-specific counts
  client_portal_count INTEGER NOT NULL DEFAULT 0,
  library_count INTEGER NOT NULL DEFAULT 0,

  -- Sync tracking
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_counts_org ON usage_counts(organization_id);

-- ============================================
-- 4. Billing Events Log (Audit Trail)
-- ============================================

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON billing_events(processed_at);

-- ============================================
-- 5. Add stripe_customer_id to organizations
-- ============================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================
-- 6. RPC Functions for Subscription Queries
-- ============================================

-- Sync usage counts for an organization
CREATE OR REPLACE FUNCTION sync_usage_counts(p_org_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_counts (organization_id, banner_count, wiki_count, play_count, member_count, client_portal_count, library_count, last_synced_at)
  VALUES (
    p_org_id,
    (SELECT COUNT(*) FROM banners WHERE organization_id = p_org_id),
    (SELECT COUNT(*) FROM wiki_entries WHERE organization_id = p_org_id),
    (SELECT COUNT(*) FROM plays WHERE organization_id = p_org_id),
    (SELECT COUNT(*) FROM organization_members WHERE organization_id = p_org_id),
    -- Client portal count (for partners)
    (SELECT COUNT(DISTINCT om.organization_id)
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     JOIN organizations o ON o.id = p_org_id
     WHERE u.home_organization_id = p_org_id
     AND om.role = 'partner'),
    -- Library count (for partners)
    (SELECT COUNT(*) FROM partner_libraries pl
     JOIN users u ON u.id = pl.owner_id
     WHERE u.home_organization_id = p_org_id),
    NOW()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    banner_count = EXCLUDED.banner_count,
    wiki_count = EXCLUDED.wiki_count,
    play_count = EXCLUDED.play_count,
    member_count = EXCLUDED.member_count,
    client_portal_count = EXCLUDED.client_portal_count,
    library_count = EXCLUDED.library_count,
    last_synced_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get subscription with limits for an organization
CREATE OR REPLACE FUNCTION get_subscription_with_limits(p_org_id UUID)
RETURNS TABLE (
  -- Subscription info
  subscription_id UUID,
  plan_type TEXT,
  plan_display_name TEXT,
  status TEXT,
  billing_interval TEXT,
  seat_count INTEGER,
  current_period_end TIMESTAMPTZ,

  -- Plan limits
  banner_limit INTEGER,
  wiki_limit INTEGER,
  play_limit INTEGER,
  client_portal_limit INTEGER,
  library_limit INTEGER,

  -- Current usage
  current_banner_count INTEGER,
  current_wiki_count INTEGER,
  current_play_count INTEGER,
  current_member_count INTEGER,
  current_client_portal_count INTEGER,
  current_library_count INTEGER,

  -- Grace period info
  is_grace_period BOOLEAN,
  grace_period_days_remaining INTEGER,

  -- Pricing (per-seat for standard, flat for partner)
  price_per_seat INTEGER,
  free_seat_threshold INTEGER,
  price_monthly INTEGER,
  is_partner_plan BOOLEAN
) AS $$
DECLARE
  v_subscription RECORD;
  v_limits RECORD;
  v_usage RECORD;
BEGIN
  -- Ensure usage counts are synced
  PERFORM sync_usage_counts(p_org_id);

  -- Get subscription (or create starter tier record if none exists)
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE organization_id = p_org_id;

  -- Get plan limits (default to starter tier)
  SELECT * INTO v_limits
  FROM plan_limits
  WHERE plan_limits.plan_type = COALESCE(v_subscription.plan_type, 'starter');

  -- Get usage counts
  SELECT * INTO v_usage
  FROM usage_counts
  WHERE organization_id = p_org_id;

  RETURN QUERY SELECT
    v_subscription.id,
    COALESCE(v_subscription.plan_type, 'starter'),
    v_limits.display_name,
    COALESCE(v_subscription.status, 'active'),
    v_subscription.billing_interval,
    COALESCE(v_subscription.seat_count, 1),
    v_subscription.current_period_end,

    v_limits.banner_limit,
    v_limits.wiki_limit,
    v_limits.play_limit,
    v_limits.client_portal_limit,
    v_limits.library_limit,

    COALESCE(v_usage.banner_count, 0),
    COALESCE(v_usage.wiki_count, 0),
    COALESCE(v_usage.play_count, 0),
    COALESCE(v_usage.member_count, 1),
    COALESCE(v_usage.client_portal_count, 0),
    COALESCE(v_usage.library_count, 0),

    COALESCE(v_subscription.status = 'grace_period', FALSE),
    CASE
      WHEN v_subscription.grace_period_ends_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM v_subscription.grace_period_ends_at - NOW())::INTEGER)
      ELSE NULL
    END,

    v_limits.price_per_seat,
    v_limits.free_seat_threshold,
    v_limits.price_monthly,
    v_limits.is_partner_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if organization can create more content of a given type
CREATE OR REPLACE FUNCTION can_create_content(p_org_id UUID, p_content_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_limits RECORD;
  v_current_count INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get subscription
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE organization_id = p_org_id;

  -- Check if in restricted mode
  IF v_subscription.status = 'restricted' THEN
    RETURN FALSE;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM plan_limits
  WHERE plan_limits.plan_type = COALESCE(v_subscription.plan_type, 'starter');

  -- Get current count and limit based on content type
  CASE p_content_type
    WHEN 'banner' THEN
      SELECT COUNT(*) INTO v_current_count FROM banners WHERE organization_id = p_org_id;
      v_limit := v_limits.banner_limit;
    WHEN 'wiki' THEN
      SELECT COUNT(*) INTO v_current_count FROM wiki_entries WHERE organization_id = p_org_id;
      v_limit := v_limits.wiki_limit;
    WHEN 'play' THEN
      SELECT COUNT(*) INTO v_current_count FROM plays WHERE organization_id = p_org_id;
      v_limit := v_limits.play_limit;
    WHEN 'member' THEN
      -- No hard seat limits in per-seat model - users just pay more
      -- But Starter plan users with >5 seats need to pay
      RETURN TRUE;
    WHEN 'client_portal' THEN
      -- For partners: count client orgs
      SELECT COUNT(DISTINCT om.organization_id) INTO v_current_count
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.home_organization_id = p_org_id AND om.role = 'partner';
      v_limit := v_limits.client_portal_limit;
    WHEN 'library' THEN
      SELECT COUNT(*) INTO v_current_count
      FROM partner_libraries pl
      JOIN users u ON u.id = pl.owner_id
      WHERE u.home_organization_id = p_org_id;
      v_limit := v_limits.library_limit;
    ELSE
      RETURN TRUE;  -- Unknown type, allow
  END CASE;

  -- -1 means unlimited
  IF v_limit = -1 OR v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_current_count < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get remaining quota for a content type
CREATE OR REPLACE FUNCTION get_remaining_quota(p_org_id UUID, p_content_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_subscription RECORD;
  v_limits RECORD;
  v_current_count INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get subscription
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE organization_id = p_org_id;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM plan_limits
  WHERE plan_limits.plan_type = COALESCE(v_subscription.plan_type, 'starter');

  -- Get current count and limit based on content type
  CASE p_content_type
    WHEN 'banner' THEN
      SELECT COUNT(*) INTO v_current_count FROM banners WHERE organization_id = p_org_id;
      v_limit := v_limits.banner_limit;
    WHEN 'wiki' THEN
      SELECT COUNT(*) INTO v_current_count FROM wiki_entries WHERE organization_id = p_org_id;
      v_limit := v_limits.wiki_limit;
    WHEN 'play' THEN
      SELECT COUNT(*) INTO v_current_count FROM plays WHERE organization_id = p_org_id;
      v_limit := v_limits.play_limit;
    ELSE
      RETURN -1;  -- Unknown type = unlimited
  END CASE;

  -- -1 means unlimited
  IF v_limit = -1 THEN
    RETURN -1;
  END IF;

  RETURN GREATEST(0, v_limit - v_current_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create or update subscription from Stripe webhook
CREATE OR REPLACE FUNCTION upsert_subscription(
  p_org_id UUID,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_price_id TEXT,
  p_plan_type TEXT,
  p_billing_interval TEXT,
  p_status TEXT,
  p_seat_count INTEGER,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_subscription_id UUID;
BEGIN
  INSERT INTO subscriptions (
    organization_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_type,
    billing_interval,
    status,
    seat_count,
    current_period_start,
    current_period_end,
    updated_at
  ) VALUES (
    p_org_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    p_plan_type,
    p_billing_interval,
    p_status,
    p_seat_count,
    p_current_period_start,
    p_current_period_end,
    NOW()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    plan_type = EXCLUDED.plan_type,
    billing_interval = EXCLUDED.billing_interval,
    status = EXCLUDED.status,
    seat_count = EXCLUDED.seat_count,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  -- Update organization's stripe_customer_id
  UPDATE organizations SET stripe_customer_id = p_stripe_customer_id
  WHERE id = p_org_id AND (stripe_customer_id IS NULL OR stripe_customer_id != p_stripe_customer_id);

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Start grace period for failed payment
CREATE OR REPLACE FUNCTION start_grace_period(p_org_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET
    status = 'grace_period',
    payment_failed_at = NOW(),
    grace_period_ends_at = NOW() + INTERVAL '7 days',
    updated_at = NOW()
  WHERE organization_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear grace period after successful payment
CREATE OR REPLACE FUNCTION clear_grace_period(p_org_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET
    status = 'active',
    payment_failed_at = NULL,
    grace_period_ends_at = NULL,
    updated_at = NOW()
  WHERE organization_id = p_org_id
  AND status IN ('grace_period', 'past_due');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check and update expired grace periods (run via cron/scheduled function)
CREATE OR REPLACE FUNCTION check_expired_grace_periods()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET status = 'restricted', updated_at = NOW()
  WHERE status = 'grace_period'
  AND grace_period_ends_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. RLS Policies
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

-- Plan limits: Everyone can read (public info)
CREATE POLICY "Anyone can read plan limits" ON plan_limits
  FOR SELECT USING (true);

-- Subscriptions: Org members can view their subscription
CREATE POLICY "Org members can view subscription" ON subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Usage counts: Org members can view their usage
CREATE POLICY "Org members can view usage" ON usage_counts
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Billing events: Only service role can insert (via webhooks)
-- Org admins can view their events
CREATE POLICY "Org admins can view billing events" ON billing_events
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 8. Grant Permissions
-- ============================================

GRANT SELECT ON plan_limits TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON usage_counts TO authenticated;
GRANT SELECT ON billing_events TO authenticated;

GRANT EXECUTE ON FUNCTION sync_usage_counts TO authenticated;
GRANT EXECUTE ON FUNCTION get_subscription_with_limits TO authenticated;
GRANT EXECUTE ON FUNCTION can_create_content TO authenticated;
GRANT EXECUTE ON FUNCTION get_remaining_quota TO authenticated;
-- upsert_subscription, start_grace_period, clear_grace_period are service-role only (webhooks)

-- ============================================
-- Summary of changes:
-- ============================================
--
-- New tables:
--   - plan_limits: Configuration for each plan tier
--   - subscriptions: Per-org subscription tracking
--   - usage_counts: Cached content counts for limit checks
--   - billing_events: Webhook event audit log
--
-- New columns:
--   - organizations.stripe_customer_id
--
-- New functions:
--   - sync_usage_counts(org_id): Update cached counts
--   - get_subscription_with_limits(org_id): Full subscription + usage info
--   - can_create_content(org_id, type): Boolean limit check
--   - get_remaining_quota(org_id, type): Remaining count for type
--   - upsert_subscription(...): Create/update from webhook
--   - start_grace_period(org_id): Begin 7-day grace
--   - clear_grace_period(org_id): Clear grace after payment
--   - check_expired_grace_periods(): Batch expire check
--
-- Pricing Model:
--   Standard Plans (Per-Seat):
--   - starter: $5/seat (free for ≤5 users), 5 banners, 10 wiki, 3 plays
--   - pro: $10/seat, unlimited content
--   - business: $20/seat, unlimited content
--
--   Partner Plans (Flat Monthly):
--   - partner_starter: $500/mo, 5 client portals
--   - partner_pro: $1,250/mo, 20 client portals
--   - partner_enterprise: $2,500/mo, unlimited portals
