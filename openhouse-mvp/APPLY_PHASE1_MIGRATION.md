# Phase 1 Migration: Simplified Trading Schema Setup

## Overview
This migration adds the database foundation for the simplified trading modal with fallback liquidity system. **All hardcoded values have been removed** - configuration is done separately via admin script.

## Prerequisites
- Admin access to Supabase SQL Editor
- Service role key configured in environment variables
- Node.js environment for configuration script

---

## Step 1: Run Database Migration

Copy and paste the **entire contents** of `migrations/001_simplified_trading_schema.sql` into your Supabase SQL Editor and execute.

The migration will:
✅ Add price tracking columns to `property_token_details`  
✅ Create `admin_settings` table (empty, no hardcoded values)  
✅ Add fallback tracking to `transactions` table  
✅ Enhance `user_holdings` table  
✅ Create `order_book_state` table with **correct UUID data types**  
✅ Create `price_history` table with **correct UUID data types**  
✅ Set up Row Level Security policies  
✅ Create helper functions with **proper UUID handling**  
✅ Initialize existing property prices from current data  

---

## Step 2: Configure Admin Settings

After the migration succeeds, configure your fallback settings:

```bash
# Run from project root
node scripts/configure-admin-settings.js [YOUR_FALLBACK_WALLET_ADDRESS]

# Example:
node scripts/configure-admin-settings.js 0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553
```

This will safely configure:
- `fallback_wallet_address` (your provided address)
- `fallback_max_slippage_bps` (100 = 1%)
- `fallback_timeout_seconds` (5 seconds)

---

## Step 3: Verify Migration

Check these tables exist in your Supabase dashboard:

1. **property_token_details** - should have new columns:
   - `current_price_usdc`
   - `price_last_updated_at` 
   - `price_source`
   - `fallback_enabled`

2. **admin_settings** - should contain 3 settings rows

3. **order_book_state** - should exist (empty initially)

4. **price_history** - should exist (empty initially)

5. **transactions** - should have new columns:
   - `execution_source`
   - `fallback_reason`
   - `original_price_usdc`
   - `executed_price_usdc`
   - `slippage_bps`

---

## Expected Results

✅ **Zero Foreign Key Errors** - All UUID data types match  
✅ **Zero Hardcoded Values** - All configuration is dynamic  
✅ **Full RLS Security** - All tables protected  
✅ **Performance Optimized** - Proper indexes created  
✅ **Audit Ready** - Complete price history tracking  

---

## Troubleshooting

**Foreign Key Constraint Error?**
- The migration now uses proper UUID types, this should not occur

**Admin Settings Empty?**
- Run the configuration script: `node scripts/configure-admin-settings.js [wallet_address]`

**Permission Denied?**
- Ensure you're using the Supabase SQL Editor with admin privileges
- Check your service role key is correctly configured

---

## Next Steps

Once migration is complete:

1. ✅ **Phase 1 Complete** - Database schema ready
2. ✅ **Phase 2 Complete** - Fallback logic implemented  
3. 🚀 **Ready for Phase 3** - Trading Modal UI simplification

The foundation is now ready for the simplified retail trading interface! 