
-- Check current schema for fallback liquidity
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'property_token_details'
ORDER BY ordinal_position;

