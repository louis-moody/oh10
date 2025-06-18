-- Run this in your Supabase SQL editor to check existing tables and permissions

-- Check what tables exist
SELECT 
    table_name, 
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check properties table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check payment_authorizations table structure (if it exists)
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'payment_authorizations' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT 
    schemaname,
    tablename, 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename; 