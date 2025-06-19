-- OpenHouse Smart Contract Integration Migration
-- Adds tables for PropertyShareToken, YieldDistributor, and OrderBookExchange integration

-- fix: just add is_admin column to existing users table (Cursor Rule 7)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- fix: add token_contract_address to existing properties table (Cursor Rule 4)
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS token_contract_address TEXT,
ADD COLUMN IF NOT EXISTS token_symbol TEXT,
ADD COLUMN IF NOT EXISTS token_deployment_hash TEXT,
ADD COLUMN IF NOT EXISTS minting_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tokens_minted INTEGER DEFAULT 0;

-- fix: create property_token_details table for tracking deployed tokens per property (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS property_token_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    contract_address TEXT NOT NULL UNIQUE,
    token_name TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    total_shares INTEGER NOT NULL CHECK (total_shares > 0),
    price_per_token DECIMAL(20,6) NOT NULL CHECK (price_per_token > 0),
    funding_goal_usdc DECIMAL(20,6) NOT NULL CHECK (funding_goal_usdc > 0),
    funding_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    treasury_address TEXT NOT NULL,
    operator_address TEXT NOT NULL,
    deployment_hash TEXT NOT NULL,
    deployment_block_number BIGINT,
    deployment_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    minting_completed BOOLEAN DEFAULT FALSE,
    tokens_minted INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- fix: create yield_distributions table for tracking USDC rental yield distributions (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS yield_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    property_token_id UUID NOT NULL REFERENCES property_token_details(id) ON DELETE CASCADE,
    distributor_contract_address TEXT NOT NULL,
    distribution_round INTEGER NOT NULL CHECK (distribution_round > 0),
    total_yield_usdc DECIMAL(20,6) NOT NULL CHECK (total_yield_usdc > 0),
    yield_per_token DECIMAL(20,6) NOT NULL CHECK (yield_per_token > 0),
    distribution_date TIMESTAMP WITH TIME ZONE NOT NULL,
    distribution_hash TEXT NOT NULL,
    distribution_block_number BIGINT,
    snapshot_block_number BIGINT,
    total_eligible_tokens INTEGER NOT NULL CHECK (total_eligible_tokens > 0),
    total_claimed_usdc DECIMAL(20,6) DEFAULT 0,
    claims_count INTEGER DEFAULT 0,
    distribution_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(property_id, distribution_round)
);

-- fix: create yield_claims table for tracking individual yield claims (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS yield_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yield_distribution_id UUID NOT NULL REFERENCES yield_distributions(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    token_balance INTEGER NOT NULL CHECK (token_balance > 0),
    yield_amount_usdc DECIMAL(20,6) NOT NULL CHECK (yield_amount_usdc > 0),
    claim_hash TEXT NOT NULL,
    claim_block_number BIGINT,
    claim_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(yield_distribution_id, wallet_address)
);

-- fix: create orderbook_activity table for tracking P2P trading events (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS orderbook_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    property_token_id UUID NOT NULL REFERENCES property_token_details(id) ON DELETE CASCADE,
    exchange_contract_address TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('buy', 'sell')),
    order_status TEXT NOT NULL CHECK (order_status IN ('created', 'filled', 'cancelled', 'partial')),
    maker_wallet_address TEXT NOT NULL,
    taker_wallet_address TEXT,
    token_amount INTEGER NOT NULL CHECK (token_amount > 0),
    price_per_token DECIMAL(20,6) NOT NULL CHECK (price_per_token > 0),
    total_usdc_amount DECIMAL(20,6) NOT NULL CHECK (total_usdc_amount > 0),
    filled_amount INTEGER DEFAULT 0,
    remaining_amount INTEGER DEFAULT 0,
    protocol_fee_usdc DECIMAL(20,6) DEFAULT 0,
    order_hash TEXT NOT NULL,
    transaction_hash TEXT,
    block_number BIGINT,
    order_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    fill_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- fix: create payment_authorizations table for tracking USDC payment approvals (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS payment_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    usdc_amount DECIMAL(20,6) NOT NULL CHECK (usdc_amount > 0),
    token_amount INTEGER NOT NULL CHECK (token_amount > 0),
    approval_hash TEXT,
    approval_block_number BIGINT,
    approval_timestamp TIMESTAMP WITH TIME ZONE,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'transferred', 'failed')),
    transfer_hash TEXT,
    transfer_block_number BIGINT,
    transfer_timestamp TIMESTAMP WITH TIME ZONE,
    tokens_minted BOOLEAN DEFAULT FALSE,
    mint_hash TEXT,
    mint_block_number BIGINT,
    mint_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(property_id, wallet_address)
);

-- fix: create user_holdings table for tracking token balances and ownership (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS user_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    property_token_id UUID NOT NULL REFERENCES property_token_details(id) ON DELETE CASCADE,
    token_balance INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
    average_purchase_price DECIMAL(20,6),
    total_invested_usdc DECIMAL(20,6) DEFAULT 0,
    total_yield_claimed_usdc DECIMAL(20,6) DEFAULT 0,
    first_purchase_date TIMESTAMP WITH TIME ZONE,
    last_transaction_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wallet_address, property_id)
);

-- fix: create transactions table for comprehensive transaction tracking (Cursor Rule 4)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'yield_claim', 'trade_buy', 'trade_sell', 'transfer')),
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    token_amount INTEGER CHECK (token_amount > 0),
    usdc_amount DECIMAL(20,6) CHECK (usdc_amount > 0),
    price_per_token DECIMAL(20,6),
    gas_used BIGINT,
    gas_price DECIMAL(20,6),
    transaction_fee_usdc DECIMAL(20,6),
    from_address TEXT,
    to_address TEXT,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- fix: create indexes for efficient querying (Cursor Rule 3)
CREATE INDEX IF NOT EXISTS idx_properties_token_address ON properties(token_contract_address);
CREATE INDEX IF NOT EXISTS idx_property_token_details_property_id ON property_token_details(property_id);
CREATE INDEX IF NOT EXISTS idx_property_token_details_contract_address ON property_token_details(contract_address);
CREATE INDEX IF NOT EXISTS idx_yield_distributions_property_id ON yield_distributions(property_id);
CREATE INDEX IF NOT EXISTS idx_yield_distributions_date ON yield_distributions(distribution_date);
CREATE INDEX IF NOT EXISTS idx_yield_claims_distribution_id ON yield_claims(yield_distribution_id);
CREATE INDEX IF NOT EXISTS idx_yield_claims_wallet ON yield_claims(wallet_address);
CREATE INDEX IF NOT EXISTS idx_orderbook_activity_property_id ON orderbook_activity(property_id);
CREATE INDEX IF NOT EXISTS idx_orderbook_activity_maker ON orderbook_activity(maker_wallet_address);
CREATE INDEX IF NOT EXISTS idx_orderbook_activity_status ON orderbook_activity(order_status);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_property_id ON payment_authorizations(property_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_wallet ON payment_authorizations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_status ON payment_authorizations(payment_status);
CREATE INDEX IF NOT EXISTS idx_user_holdings_wallet ON user_holdings(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_holdings_property_id ON user_holdings(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_property_id ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(transaction_timestamp);

-- fix: create RLS policies for secure access control (Cursor Rule 3)
ALTER TABLE property_token_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE yield_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE yield_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE orderbook_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- fix: RLS policy for property_token_details - public read access (Cursor Rule 3)
CREATE POLICY "Public read access for property token details" ON property_token_details
    FOR SELECT USING (true);

-- fix: RLS policy for yield_distributions - public read access (Cursor Rule 3)
CREATE POLICY "Public read access for yield distributions" ON yield_distributions
    FOR SELECT USING (true);

-- fix: RLS policy for yield_claims - temporarily allow all access, implement app-level filtering (Cursor Rule 3)
CREATE POLICY "Allow access to yield claims" ON yield_claims
    FOR SELECT USING (true);

-- fix: RLS policy for orderbook_activity - public read access for transparency (Cursor Rule 3)
CREATE POLICY "Public read access for orderbook activity" ON orderbook_activity
    FOR SELECT USING (true);

-- fix: RLS policy for payment_authorizations - temporarily allow all access, implement app-level filtering (Cursor Rule 3)
CREATE POLICY "Allow access to payment authorizations" ON payment_authorizations
    FOR SELECT USING (true);

-- fix: RLS policy for user_holdings - temporarily allow all access, implement app-level filtering (Cursor Rule 3)
CREATE POLICY "Allow access to user holdings" ON user_holdings
    FOR SELECT USING (true);

-- fix: RLS policy for transactions - temporarily allow all access, implement app-level filtering (Cursor Rule 3)
CREATE POLICY "Allow access to transactions" ON transactions
    FOR SELECT USING (true);

-- fix: create helper functions for contract integration (Cursor Rule 4)
CREATE OR REPLACE FUNCTION get_property_funding_progress(property_uuid UUID)
RETURNS TABLE(
    total_shares INTEGER,
    tokens_minted INTEGER,
    progress_percentage DECIMAL(5,2),
    raised_amount DECIMAL(20,6),
    funding_goal DECIMAL(20,6)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ptd.total_shares,
        ptd.tokens_minted,
        CASE 
            WHEN ptd.total_shares > 0 THEN ROUND((ptd.tokens_minted * 100.0 / ptd.total_shares), 2)
            ELSE 0
        END as progress_percentage,
        COALESCE(SUM(pa.usdc_amount), 0) as raised_amount,
        ptd.funding_goal_usdc
    FROM property_token_details ptd
    LEFT JOIN payment_authorizations pa ON pa.property_id = property_uuid 
        AND pa.payment_status = 'transferred'
    WHERE ptd.property_id = property_uuid
    GROUP BY ptd.total_shares, ptd.tokens_minted, ptd.funding_goal_usdc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- fix: create function to validate USDC payment authorization (Cursor Rule 4)
CREATE OR REPLACE FUNCTION validate_payment_authorization(
    property_uuid UUID,
    wallet_addr TEXT,
    usdc_amount DECIMAL(20,6),
    token_amount INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    property_token_record RECORD;
    expected_usdc_amount DECIMAL(20,6);
BEGIN
    -- Get property token details
    SELECT ptd.* INTO property_token_record
    FROM property_token_details ptd
    WHERE ptd.property_id = property_uuid;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate expected USDC amount
    expected_usdc_amount = token_amount * property_token_record.price_per_token;
    
    -- Validate amounts match
    IF ABS(usdc_amount - expected_usdc_amount) > 0.000001 THEN
        RETURN FALSE;
    END IF;
    
    -- Check if minting is still available
    IF (property_token_record.tokens_minted + token_amount) > property_token_record.total_shares THEN
        RETURN FALSE;
    END IF;
    
    -- Check funding deadline
    IF NOW() > property_token_record.funding_deadline THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- fix: add comments for documentation (Cursor Rule 4)
COMMENT ON TABLE property_token_details IS 'Tracks deployed PropertyShareToken contracts per property';
COMMENT ON TABLE yield_distributions IS 'Logs USDC rental yield distribution rounds per property';
COMMENT ON TABLE yield_claims IS 'Tracks individual user yield claims per distribution';
COMMENT ON TABLE orderbook_activity IS 'Mirrors OrderBookExchange trading activity on-chain';
COMMENT ON TABLE payment_authorizations IS 'Tracks USDC payment approvals and token minting process';
COMMENT ON TABLE user_holdings IS 'Tracks user token balances and investment history per property';
COMMENT ON TABLE transactions IS 'Comprehensive transaction log for all on-chain activities';

COMMENT ON FUNCTION get_property_funding_progress IS 'Calculates real-time funding progress for a property';
COMMENT ON FUNCTION validate_payment_authorization IS 'Validates USDC payment authorization against property token parameters'; 