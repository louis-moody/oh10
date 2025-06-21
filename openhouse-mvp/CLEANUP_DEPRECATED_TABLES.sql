-- OpenHouse Deprecated Tables Cleanup
-- Run this in Supabase SQL Editor to remove deprecated tables

-- ========================================
-- DEPRECATED TABLES TO DELETE (Per PRD)
-- ========================================

-- 🚫 Drop orderbook_activity (replaced by property_activity)
DROP TABLE IF EXISTS orderbook_activity CASCADE;

-- 🚫 Drop yield_claims (handled by smart contracts)
DROP TABLE IF EXISTS yield_claims CASCADE;

-- 🚫 Drop admin_settings (moved to environment variables)
DROP TABLE IF EXISTS admin_settings CASCADE;

-- 🚫 Drop order_book_state (redundant)
DROP TABLE IF EXISTS order_book_state CASCADE;

-- 🚫 Drop price_history (derived from transactions)
DROP TABLE IF EXISTS price_history CASCADE;

-- 🚫 Drop yield_distributions (handled by smart contracts)
DROP TABLE IF EXISTS yield_distributions CASCADE;

-- 🚫 Drop active_sessions (using JWT tokens)
DROP TABLE IF EXISTS active_sessions CASCADE;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check remaining tables
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify core tables exist
SELECT 
  'properties' as table_name,
  COUNT(*) as row_count
FROM properties
UNION ALL
SELECT 
  'property_details',
  COUNT(*)
FROM property_details
UNION ALL
SELECT 
  'property_financials',
  COUNT(*)
FROM property_financials
UNION ALL
SELECT 
  'property_activity',
  COUNT(*)
FROM property_activity
UNION ALL
SELECT 
  'property_token_details',
  COUNT(*)
FROM property_token_details
UNION ALL
SELECT 
  'payment_authorizations',
  COUNT(*)
FROM payment_authorizations
UNION ALL
SELECT 
  'transactions',
  COUNT(*)
FROM transactions
UNION ALL
SELECT 
  'user_holdings',
  COUNT(*)
FROM user_holdings
UNION ALL
SELECT 
  'users',
  COUNT(*)
FROM users;

-- ========================================
-- FINAL SCHEMA SUMMARY
-- ========================================

/*
✅ CORE TABLES REMAINING:

1. properties - Main property listings
2. property_details - Property specifications
3. property_financials - Financial metrics  
4. property_activity - Trading activity (SINGLE SOURCE OF TRUTH)
5. property_token_details - Token contract info
6. payment_authorizations - USDC approvals
7. transactions - Completed trades
8. user_holdings - Token ownership
9. users - User authentication

🚫 DEPRECATED TABLES REMOVED:

- orderbook_activity (replaced by property_activity)
- yield_claims (handled by smart contracts)
- admin_settings (moved to environment variables)
- order_book_state (redundant)
- price_history (derived from transactions)
- yield_distributions (handled by smart contracts)
- active_sessions (using JWT tokens)

✅ PRODUCTION READY ARCHITECTURE
*/ 