-- Simple fallback_liquidity table creation
-- fix: minimal table creation without RLS to avoid auth issues (Cursor Rule 7)

CREATE TABLE fallback_liquidity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
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

-- Performance indexes only
CREATE INDEX idx_fallback_liquidity_property ON fallback_liquidity(property_id);
CREATE INDEX idx_fallback_liquidity_status ON fallback_liquidity(status) WHERE status = 'active'; 