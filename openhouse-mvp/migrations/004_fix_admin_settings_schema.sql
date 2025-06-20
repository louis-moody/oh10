-- PRD Fix: Create proper admin_settings table and populate fallback data
-- fix: admin_settings table with correct structure for fallback system (Cursor Rule 2)

-- Drop existing admin_settings if it exists (to fix schema mismatch)
DROP TABLE IF EXISTS admin_settings;

-- Create admin_settings with both patterns to support existing code
CREATE TABLE admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Also add direct column for trading/route.ts compatibility
  fallback_wallet_address TEXT
);

-- Insert the fallback wallet configuration
INSERT INTO admin_settings (setting_key, setting_value, description, is_sensitive, fallback_wallet_address) 
VALUES 
  ('fallback_wallet_address', '0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553', 'Fallback wallet for providing liquidity when order book is insufficient', true, '0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553'),
  ('fallback_max_slippage_bps', '100', 'Maximum slippage tolerance for fallback trades in basis points (1%)', false, '0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553'),
  ('fallback_timeout_seconds', '5', 'Time to wait for order book matching before falling back', false, '0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553');

-- Create indexes for performance
CREATE INDEX idx_admin_settings_key ON admin_settings(setting_key);

-- Test query to verify data
SELECT 'admin_settings verification:' as test;
SELECT setting_key, setting_value, fallback_wallet_address FROM admin_settings; 