-- SUPABASE SYNC: Update all tables with correct contract addresses
-- Property: London Flat (795d70a0-7807-4d73-be93-b19050e9dec8)
-- PropertyShareToken: 0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F (WORKING)
-- OrderBookExchange: 0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3 (NEW WORKING)

-- 1. UPDATE PROPERTIES TABLE
UPDATE properties 
SET 
  orderbook_contract_address = '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3',
  token_contract_address = '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
  status = 'completed',
  updated_at = NOW()
WHERE id = '795d70a0-7807-4d73-be93-b19050e9dec8';

-- 2. UPDATE PROPERTY_TOKEN_DETAILS TABLE  
UPDATE property_token_details
SET 
  contract_address = '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F',
  orderbook_contract_address = '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3',
  total_shares = 50,
  price_per_token = 1,
  total_supply = 50,
  available_shares = 50,
  token_name = 'London Flat Shares',
  token_symbol = 'LONDON',
  price_source = 'openhouse',
  updated_at = NOW()
WHERE property_id = '795d70a0-7807-4d73-be93-b19050e9dec8';

-- 3. ENSURE ORDER_BOOK TABLE IS READY
-- Clear any stale orders from broken contracts
DELETE FROM order_book 
WHERE property_id = '795d70a0-7807-4d73-be93-b19050e9dec8'
  AND contract_address != '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3';

-- 4. VERIFY ALL COLUMNS EXIST IN ORDER_BOOK TABLE
-- These should already exist from previous fixes, but ensure they're there
DO $$
BEGIN
  -- Add contract_order_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_book' AND column_name = 'contract_order_id'
  ) THEN
    ALTER TABLE order_book ADD COLUMN contract_order_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_order_book_contract_order_id ON order_book(contract_order_id);
  END IF;

  -- Add shares_remaining if missing  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_book' AND column_name = 'shares_remaining'
  ) THEN
    ALTER TABLE order_book ADD COLUMN shares_remaining DECIMAL DEFAULT 0;
  END IF;

  -- Add transaction_hash if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_book' AND column_name = 'transaction_hash'
  ) THEN
    ALTER TABLE order_book ADD COLUMN transaction_hash TEXT;
  END IF;

  -- Add contract_address if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_book' AND column_name = 'contract_address'
  ) THEN
    ALTER TABLE order_book ADD COLUMN contract_address TEXT;
  END IF;

  -- Add status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_book' AND column_name = 'status'
  ) THEN
    ALTER TABLE order_book ADD COLUMN status TEXT DEFAULT 'open';
  END IF;
END $$;

-- 5. CREATE ORDER_BOOK_STATE TABLE IF MISSING
CREATE TABLE IF NOT EXISTS order_book_state (
  id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  orderbook_contract_address TEXT NOT NULL,
  best_buy_price_usdc DECIMAL,
  best_sell_price_usdc DECIMAL,
  total_buy_volume DECIMAL DEFAULT 0,
  total_sell_volume DECIMAL DEFAULT 0,
  spread_percentage DECIMAL,
  last_trade_price_usdc DECIMAL,
  last_trade_timestamp TIMESTAMPTZ,
  snapshot_timestamp TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id)
);

-- 6. INSERT/UPDATE ORDER_BOOK_STATE FOR LONDON FLAT
INSERT INTO order_book_state (
  property_id, 
  orderbook_contract_address,
  total_buy_volume,
  total_sell_volume,
  snapshot_timestamp
) VALUES (
  '795d70a0-7807-4d73-be93-b19050e9dec8',
  '0xf6E6439707Ed80D141DE2cb05f6E6c04F28de2c3', 
  0,
  0,
  NOW()
) ON CONFLICT (property_id) DO UPDATE SET
  orderbook_contract_address = EXCLUDED.orderbook_contract_address,
  snapshot_timestamp = NOW();

-- 7. VERIFICATION QUERIES
-- Check properties table
SELECT 
  id,
  name,
  token_contract_address,
  orderbook_contract_address,
  status,
  total_shares,
  price_per_token
FROM properties 
WHERE id = '795d70a0-7807-4d73-be93-b19050e9dec8';

-- Check property_token_details table  
SELECT 
  property_id,
  contract_address,
  orderbook_contract_address,
  token_name,
  token_symbol,
  total_shares,
  price_per_token,
  total_supply,
  available_shares
FROM property_token_details
WHERE property_id = '795d70a0-7807-4d73-be93-b19050e9dec8';

-- Check order_book table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'order_book' 
ORDER BY ordinal_position;

-- Check order_book_state table
SELECT * FROM order_book_state 
WHERE property_id = '795d70a0-7807-4d73-be93-b19050e9dec8';

-- SUCCESS MESSAGE
SELECT 'SUPABASE SYNC COMPLETE - ALL CONTRACTS ALIGNED!' as status; 