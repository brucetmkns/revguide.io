-- Migration: Simplify Users RLS to Eliminate All Recursion
-- Run this in Supabase SQL Editor
--
-- Problem: Even with SECURITY DEFINER functions, there's still recursion
-- because RLS policies are evaluated on every table access including
-- during function execution.
--
-- Solution: Use the simplest possible policy - just auth.uid() comparison.
-- No functions, no subqueries, no cross-table lookups.

-- ============================================
-- 1. Drop ALL existing policies on users table
-- ============================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON users', pol.policyname);
    END LOOP;
END $$;

-- ============================================
-- 2. Create minimal, non-recursive policies
-- ============================================

-- Users can SELECT their own row (direct auth.uid() comparison only)
CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- Users can UPDATE their own row (direct auth.uid() comparison only)
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Users can INSERT their own row (for signup flow)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

-- Service role bypasses RLS entirely (for edge functions)
CREATE POLICY "users_service_role" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. Verify RLS is enabled
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Test query (run this manually to verify)
-- ============================================
-- This should now work without recursion:
-- UPDATE users SET name = 'Test' WHERE auth_user_id = auth.uid();
