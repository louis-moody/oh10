-- PRD Requirement #2: Manual Test Query for Fallback Data
-- Run this in Supabase SQL Editor to verify fallback system

-- Test 1: Verify admin_settings table and fallback wallet
SELECT 'Test 1: Admin Settings Check' as test_name;
SELECT 
  setting_key, 
  setting_value, 
  fallback_wallet_address,
  created_at
FROM admin_settings 
WHERE setting_key = 'fallback_wallet_address';

-- Test 2: Verify fallback_liquidity table exists and structure
SELECT 'Test 2: Fallback Liquidity Table Structure' as test_name;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'fallback_liquidity' 
ORDER BY ordinal_position;

-- Test 3: Check property_token_details has fallback_enabled column
SELECT 'Test 3: Property Token Details Fallback Column' as test_name;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'property_token_details' 
AND column_name = 'fallback_enabled';

-- Test 4: Test actual fallback data for London Flat property
SELECT 'Test 4: London Flat Fallback Status' as test_name;
SELECT 
  p.id as property_id,
  p.name,
  ptd.current_price_usdc,
  ptd.fallback_enabled,
  fl.enabled as liquidity_enabled,
  fl.buy_price_usdc,
  fl.status
FROM properties p
LEFT JOIN property_token_details ptd ON p.id = ptd.property_id
LEFT JOIN fallback_liquidity fl ON p.id = fl.property_id
WHERE p.name = 'London Flat';

-- Test 5: Verify foreign key relationship works
SELECT 'Test 5: Foreign Key Relationship Test' as test_name;
SELECT 
  tc.constraint_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name = 'fallback_liquidity';

-- Expected Results:
-- Test 1: Should show fallback wallet 0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553
-- Test 2: Should show all fallback_liquidity columns
-- Test 3: Should show fallback_enabled BOOLEAN column
-- Test 4: Should show London Flat property with fallback status
-- Test 5: Should show foreign key to properties(id) 