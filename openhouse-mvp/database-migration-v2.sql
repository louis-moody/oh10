-- OpenHouse MVP Database Migration v2
-- Adds missing columns for authentication flow + user profile completion

-- 1. Add wallet_address column to active_sessions for direct lookup
ALTER TABLE active_sessions 
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- 2. Add updated_at column to users table for tracking changes
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2.1. Add name and email columns for user profile completion
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_active_sessions_wallet_address ON active_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_active_sessions_jwt_id ON active_sessions(jwt_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

-- 7. Create function to check if user profile is complete
CREATE OR REPLACE FUNCTION is_profile_complete(user_wallet TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE wallet_address = user_wallet 
        AND name IS NOT NULL 
        AND email IS NOT NULL 
        AND profile_completed = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN active_sessions.wallet_address IS 'Direct wallet address storage for efficient session lookup';
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last record update, automatically maintained';
COMMENT ON COLUMN users.name IS 'User full name for profile completion';
COMMENT ON COLUMN users.email IS 'User email for notifications and marketing';
COMMENT ON COLUMN users.profile_completed IS 'Flag indicating if user has completed name/email capture';
COMMENT ON COLUMN users.marketing_consent IS 'User consent for marketing communications about properties and crowdfunding'; 