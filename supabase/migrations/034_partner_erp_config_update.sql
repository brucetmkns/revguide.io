-- Allow partners to update ERP config for organizations they manage
CREATE OR REPLACE FUNCTION update_org_erp_config(
  p_org_id UUID,
  p_erp_config JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_member BOOLEAN := FALSE;
BEGIN
  -- Get the internal user ID for the current auth user
  SELECT id INTO v_user_id
  FROM users
  WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Check if user is a member of this organization (via organization_members)
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = v_user_id
    AND role IN ('owner', 'admin', 'partner')
  ) INTO v_is_member;

  -- Also check if user owns this org directly
  IF NOT v_is_member THEN
    SELECT EXISTS (
      SELECT 1 FROM users
      WHERE id = v_user_id
      AND organization_id = p_org_id
    ) INTO v_is_member;
  END IF;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not authorized to update this organization';
  END IF;

  -- Perform the update
  UPDATE organizations
  SET erp_config = p_erp_config,
      updated_at = NOW()
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_org_erp_config(UUID, JSONB) TO authenticated;
