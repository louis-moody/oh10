-- Create fallback_liquidity table for admin-controlled fallback trading
-- fix: fallback liquidity schema for admin control (Cursor Rule 4)

CREATE TABLE IF NOT EXISTS fallback_liquidity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  enabled BOOLEAN DEFAULT false,
  buy_price_usdc DECIMAL(20,6) NOT NULL,
  liquidity_pool_usdc DECIMAL(20,6) DEFAULT 0,
  daily_limit_usdc DECIMAL(20,6) DEFAULT 10000,
  transaction_limit_usdc DECIMAL(20,6) DEFAULT 1000,
  discount_percent DECIMAL(5,2) DEFAULT 2.0,
  status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id)
);

-- Enable RLS
ALTER TABLE fallback_liquidity ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/write fallback liquidity settings
CREATE POLICY "Admin can manage fallback liquidity"
  ON fallback_liquidity
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid()::text 
      AND is_admin = true
    )
  );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_fallback_liquidity_property ON fallback_liquidity(property_id);
CREATE INDEX IF NOT EXISTS idx_fallback_liquidity_status ON fallback_liquidity(status) WHERE status = 'active'; 