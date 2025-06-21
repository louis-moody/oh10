-- Minimal Seed Data - Only Basic Columns
-- Run this in Supabase SQL Editor

-- First, let's check what columns actually exist
-- Run this query first to see your table structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'property_details';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'property_financials';

-- ========================================
-- BASIC PROPERTY DETAILS (Minimal columns)
-- ========================================

-- Only insert if property_details table exists and has these basic columns
INSERT INTO property_details (
  property_id, 
  property_type, 
  bedrooms, 
  bathrooms, 
  square_footage, 
  full_address, 
  city
)
SELECT 
  p.id as property_id,
  'Residential' as property_type,
  2 as bedrooms,
  1 as bathrooms,
  850 as square_footage,
  '123 Sample Street, London' as full_address,
  'London' as city
FROM properties p
WHERE NOT EXISTS (
  SELECT 1 FROM property_details pd WHERE pd.property_id = p.id
)
LIMIT 3;

-- ========================================
-- BASIC PROPERTY FINANCIALS (Minimal columns)
-- ========================================

-- Only insert if property_financials table exists and has these basic columns
INSERT INTO property_financials (
  property_id,
  purchase_price,
  annual_yield_pct,
  annual_rental_income_gross,
  annual_rental_income_net
)
SELECT 
  p.id as property_id,
  250000 as purchase_price,
  6.5 as annual_yield_pct,
  18000 as annual_rental_income_gross,
  16250 as annual_rental_income_net
FROM properties p
WHERE NOT EXISTS (
  SELECT 1 FROM property_financials pf WHERE pf.property_id = p.id
)
LIMIT 3;

-- ========================================
-- VERIFICATION
-- ========================================

-- Check what was inserted
SELECT 'Properties' as table_name, COUNT(*) as count FROM properties
UNION ALL
SELECT 'Property Details', COUNT(*) FROM property_details
UNION ALL
SELECT 'Property Financials', COUNT(*) FROM property_financials;

-- Show sample data
SELECT 
  p.name,
  pd.property_type,
  pd.bedrooms,
  pd.city,
  pf.annual_yield_pct
FROM properties p
LEFT JOIN property_details pd ON p.id = pd.property_id
LEFT JOIN property_financials pf ON p.id = pf.property_id
LIMIT 3; 