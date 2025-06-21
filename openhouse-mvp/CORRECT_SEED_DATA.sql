-- Correct Seed Data - Matches Actual Table Structure
-- Run this in Supabase SQL Editor

-- ========================================
-- 1. PROPERTY FINANCIALS (Actual columns)
-- ========================================

INSERT INTO property_financials (
  property_id,
  price_per_share,
  monthly_income,
  annual_return,
  property_value,
  cash_on_cash,
  cap_rate,
  roi,
  gross_rent_multiplier,
  net_operating_income,
  expense_ratio,
  vacancy_rate,
  break_even_ratio,
  annual_yield_pct
)
SELECT 
  p.id as property_id,
  p.price_per_token as price_per_share,
  ROUND((p.funding_goal_usdc * 1.25 * 0.06 / 12)::NUMERIC, 2) as monthly_income,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 8.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 9.5
    ELSE 9.0
  END as annual_return,
  ROUND((p.funding_goal_usdc * 1.25)::NUMERIC, 0) as property_value,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 12.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 14.2
    ELSE 13.8
  END as cash_on_cash,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 4.8
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 5.8
    ELSE 5.3
  END as cap_rate,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 8.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 9.5
    ELSE 9.0
  END as roi,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 16.8
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 14.2
    ELSE 15.5
  END as gross_rent_multiplier,
  ROUND(((p.funding_goal_usdc * 1.25) * 0.048)::NUMERIC, 0) as net_operating_income,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 0.25
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 0.22
    ELSE 0.23
  END as expense_ratio,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 0.05
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 0.07
    ELSE 0.06
  END as vacancy_rate,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 0.85
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 0.78
    ELSE 0.82
  END as break_even_ratio,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 5.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 6.5
    ELSE 6.0
  END as annual_yield_pct
FROM properties p
WHERE NOT EXISTS (
  SELECT 1 FROM property_financials pf WHERE pf.property_id = p.id
);

-- ========================================
-- 2. PROPERTY DETAILS (Need to check structure)
-- ========================================

-- First check what columns exist in property_details:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'property_details';

-- Basic insert for property_details (uncomment after checking structure):
/*
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
  CASE 
    WHEN p.name ILIKE '%apartment%' OR p.name ILIKE '%flat%' THEN 'Apartment'
    WHEN p.name ILIKE '%house%' OR p.name ILIKE '%home%' THEN 'House'
    WHEN p.name ILIKE '%studio%' THEN 'Studio'
    WHEN p.name ILIKE '%penthouse%' THEN 'Penthouse'
    ELSE 'Residential'
  END as property_type,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN 0
    WHEN p.name ILIKE '%1 bed%' OR p.name ILIKE '%one bed%' THEN 1
    WHEN p.name ILIKE '%3 bed%' OR p.name ILIKE '%three bed%' THEN 3
    WHEN p.name ILIKE '%4 bed%' OR p.name ILIKE '%four bed%' THEN 4
    ELSE 2
  END as bedrooms,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN 1
    WHEN p.name ILIKE '%1 bed%' OR p.name ILIKE '%one bed%' THEN 1
    WHEN p.name ILIKE '%3 bed%' OR p.name ILIKE '%three bed%' THEN 2
    WHEN p.name ILIKE '%4 bed%' OR p.name ILIKE '%four bed%' THEN 3
    ELSE 1
  END as bathrooms,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN 450
    WHEN p.name ILIKE '%1 bed%' OR p.name ILIKE '%one bed%' THEN 650
    WHEN p.name ILIKE '%3 bed%' OR p.name ILIKE '%three bed%' THEN 1100
    WHEN p.name ILIKE '%4 bed%' OR p.name ILIKE '%four bed%' THEN 1400
    ELSE 850
  END as square_footage,
  CASE 
    WHEN p.name ILIKE '%london%' THEN '45 Canary Wharf, London E14 5AB'
    WHEN p.name ILIKE '%manchester%' THEN '234 Deansgate, Manchester M3 4LZ'
    WHEN p.name ILIKE '%birmingham%' THEN '90 Broad Street, Birmingham B1 1AA'
    ELSE '123 High Street, Bristol BS1 4DJ'
  END as full_address,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 'London'
    WHEN p.name ILIKE '%manchester%' THEN 'Manchester'
    WHEN p.name ILIKE '%birmingham%' THEN 'Birmingham'
    ELSE 'Bristol'
  END as city
FROM properties p
WHERE NOT EXISTS (
  SELECT 1 FROM property_details pd WHERE pd.property_id = p.id
);
*/

-- ========================================
-- VERIFICATION
-- ========================================

-- Check what was inserted
SELECT 'Properties' as table_name, COUNT(*) as count FROM properties
UNION ALL
SELECT 'Property Financials', COUNT(*) FROM property_financials
UNION ALL
SELECT 'Property Details', COUNT(*) FROM property_details;

-- Show financial data
SELECT 
  p.name,
  pf.annual_yield_pct,
  pf.monthly_income,
  pf.property_value,
  pf.cap_rate,
  pf.roi
FROM properties p
LEFT JOIN property_financials pf ON p.id = pf.property_id
LIMIT 3; 