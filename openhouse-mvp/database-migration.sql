-- OpenHouse MVP Database Migration
-- Adds missing columns for authentication flow

-- 1. Add wallet_address column to active_sessions for direct lookup
ALTER TABLE active_sessions 
ADD COLUMN wallet_address TEXT;

-- 2. Add updated_at column to users table for tracking changes
ALTER TABLE users 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_sessions_wallet_address ON active_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_active_sessions_jwt_id ON active_sessions(jwt_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

-- 4. Add trigger to automatically update updated_at on users table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Update RLS policies if needed (uncomment if you want to enable RLS)
-- ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own sessions
-- CREATE POLICY "Users can access their own sessions" ON active_sessions
--     FOR ALL USING (wallet_address = auth.jwt() ->> 'wallet_address');

-- Create policy for users to access their own user record
-- CREATE POLICY "Users can access their own record" ON users
--     FOR ALL USING (wallet_address = auth.jwt() ->> 'wallet_address');

-- 6. Create RPC function for session validation (if needed elsewhere)
CREATE OR REPLACE FUNCTION is_valid_session(session_id UUID, wallet_addr TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM active_sessions 
        WHERE id = session_id 
        AND wallet_address = wallet_addr 
        AND revoked = FALSE 
        AND expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN active_sessions.wallet_address IS 'Direct wallet address storage for efficient session lookup';
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last record update, automatically maintained'; 