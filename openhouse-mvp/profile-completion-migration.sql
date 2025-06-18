-- OpenHouse Profile Completion Migration
-- Adds name, email, and profile completion fields to users table

-- Add profile completion columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

-- Add email index for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create function to check if user profile is complete
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

-- Add comments for documentation
COMMENT ON COLUMN users.name IS 'User full name for profile completion';
COMMENT ON COLUMN users.email IS 'User email for notifications and marketing';
COMMENT ON COLUMN users.profile_completed IS 'Flag indicating if user has completed name/email capture';
COMMENT ON COLUMN users.marketing_consent IS 'User consent for marketing communications about properties and crowdfunding'; 