-- Simple Fallback Trading Migration
-- fix: minimal schema for admin fallback orders (Cursor Rule 7)

-- Just add is_fallback_trade to transactions (keep it simple)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS is_fallback_trade BOOLEAN DEFAULT FALSE;

-- Add fallback_liquidity_enabled to property_token_details  
ALTER TABLE property_token_details 
ADD COLUMN IF NOT EXISTS fallback_liquidity_enabled BOOLEAN DEFAULT FALSE; 