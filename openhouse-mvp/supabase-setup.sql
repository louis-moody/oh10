-- OpenHouse MVP Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    price_per_token DECIMAL(10,2) NOT NULL,
    total_shares INTEGER NOT NULL,
    funding_goal_usdc DECIMAL(12,2) NOT NULL,
    funding_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'funded', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment authorizations table
CREATE TABLE IF NOT EXISTS payment_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_wallet_address TEXT NOT NULL,
    amount_usdc DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    transaction_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User holdings table
CREATE TABLE IF NOT EXISTS user_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    shares INTEGER NOT NULL DEFAULT 0,
    total_invested_usdc DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, property_id)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    payment_authorization_id UUID REFERENCES payment_authorizations(id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'dividend')),
    amount_usdc DECIMAL(12,2) NOT NULL,
    shares INTEGER NOT NULL,
    transaction_hash TEXT UNIQUE,
    block_number BIGINT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Properties: Public read access for active/funded properties
CREATE POLICY "Properties are viewable by everyone" ON properties
    FOR SELECT USING (status IN ('active', 'funded', 'completed'));

-- Payment authorizations: Users can only see their own
CREATE POLICY "Users can view their own payment authorizations" ON payment_authorizations
    FOR SELECT USING (auth.jwt() ->> 'wallet_address' = user_wallet_address);

CREATE POLICY "Users can insert their own payment authorizations" ON payment_authorizations
    FOR INSERT WITH CHECK (auth.jwt() ->> 'wallet_address' = user_wallet_address);

-- Users: Users can view and update their own record
CREATE POLICY "Users can view their own record" ON users
    FOR SELECT USING (auth.jwt() ->> 'wallet_address' = wallet_address);

CREATE POLICY "Users can insert their own record" ON users
    FOR INSERT WITH CHECK (auth.jwt() ->> 'wallet_address' = wallet_address);

CREATE POLICY "Users can update their own record" ON users
    FOR UPDATE USING (auth.jwt() ->> 'wallet_address' = wallet_address);

-- User holdings: Users can only see their own holdings
CREATE POLICY "Users can view their own holdings" ON user_holdings
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM users WHERE users.id = user_holdings.user_id 
        AND auth.jwt() ->> 'wallet_address' = users.wallet_address
    ));

-- Transactions: Users can only see their own transactions
CREATE POLICY "Users can view their own transactions" ON transactions
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM users WHERE users.id = transactions.user_id 
        AND auth.jwt() ->> 'wallet_address' = users.wallet_address
    ));

-- Insert some sample data for testing
INSERT INTO properties (name, description, image_url, price_per_token, total_shares, funding_goal_usdc, funding_deadline, status) VALUES
('The Shard Residential', 'Luxury residential units in The Shard, London', 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&h=600&fit=crop', 100.00, 10000, 1000000.00, NOW() + INTERVAL '30 days', 'active'),
('Canary Wharf Office Complex', 'Modern office space in Canary Wharf financial district', 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=600&fit=crop', 250.00, 5000, 1250000.00, NOW() + INTERVAL '45 days', 'active'),
('Manchester Student Housing', 'Purpose-built student accommodation near Manchester University', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop', 50.00, 20000, 1000000.00, NOW() + INTERVAL '60 days', 'active')
ON CONFLICT DO NOTHING;

-- Insert some sample payment authorizations for testing
-- (You'll need to replace these with real wallet addresses when testing)
INSERT INTO payment_authorizations (property_id, user_wallet_address, amount_usdc, status) 
SELECT 
    p.id,
    '0x742d35cc6634c0532925a3b8d2a4e0a44d69e5a1' as user_wallet_address,
    (RANDOM() * 10000 + 1000)::DECIMAL(12,2) as amount_usdc,
    'completed' as status
FROM properties p
WHERE p.status = 'active'
ON CONFLICT DO NOTHING; 