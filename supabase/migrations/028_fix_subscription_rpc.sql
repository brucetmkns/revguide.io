-- Fix get_subscription_with_limits to not call sync in read path
-- The STABLE marker prevents writes, so we need to remove the sync call

-- Recreate the function without STABLE and without sync call
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
  v_banner_count INTEGER;
  v_wiki_count INTEGER;
  v_play_count INTEGER;
  v_member_count INTEGER;
  v_portal_count INTEGER;
  v_library_count INTEGER;
BEGIN
  -- Get subscription (default to starter if none exists)
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE organization_id = p_org_id;

  -- Get plan limits (default to starter tier)
  SELECT * INTO v_limits
  FROM plan_limits
  WHERE plan_limits.plan_type = COALESCE(v_subscription.plan_type, 'starter');

  -- Count content directly (no caching/sync needed)
  SELECT COUNT(*) INTO v_banner_count FROM banners WHERE organization_id = p_org_id;
  SELECT COUNT(*) INTO v_wiki_count FROM wiki_entries WHERE organization_id = p_org_id;
  SELECT COUNT(*) INTO v_play_count FROM plays WHERE organization_id = p_org_id;
  SELECT COUNT(*) INTO v_member_count FROM organization_members WHERE organization_id = p_org_id;

  -- Count partner-specific items
  SELECT COUNT(DISTINCT om.organization_id) INTO v_portal_count
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  WHERE u.home_organization_id = p_org_id AND om.role = 'partner';

  SELECT COUNT(*) INTO v_library_count
  FROM partner_libraries pl
  JOIN users u ON u.id = pl.owner_id
  WHERE u.home_organization_id = p_org_id;

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

    v_banner_count,
    v_wiki_count,
    v_play_count,
    v_member_count,
    v_portal_count,
    v_library_count,

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_subscription_with_limits TO authenticated;
