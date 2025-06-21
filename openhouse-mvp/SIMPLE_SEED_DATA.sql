-- Simple Seed Data for OpenHouse - Production Ready
-- Run this in Supabase SQL Editor

-- ========================================
-- 1. PROPERTY DETAILS (Fixed Schema)
-- ========================================

INSERT INTO property_details (
  property_id, 
  property_type, 
  bedrooms, 
  bathrooms, 
  square_footage, 
  full_address, 
  city, 
  ownership_model, 
  lease_information, 
  amenities, 
  developer_info,
  created_at,
  updated_at
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
  END as city,
  'Special Purpose Vehicle (SPV) - Investors hold tokenized shares representing beneficial ownership in the property-owning SPV. Legal title held by SPV, managed by OpenHouse as asset manager.' as ownership_model,
  'Buy-to-let property with assured shorthold tenancy. Current lease expires December 2025. Rent reviews annually in line with RPI increases.' as lease_information,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN ARRAY['Modern kitchen', 'High-speed internet', 'Concierge']
    WHEN p.name ILIKE '%luxury%' OR p.name ILIKE '%penthouse%' THEN 
      ARRAY['Balcony/Terrace', 'Gym/Fitness center', 'Concierge', 'Parking space', 'Storage unit', 'High-end appliances']
    ELSE 
      ARRAY['Central heating', 'Modern kitchen', 'High-speed internet', 'Transport links']
  END as amenities,
  CASE 
    WHEN p.name ILIKE '%canary wharf%' OR p.name ILIKE '%luxury%' THEN 
      'Developed by Berkeley Group in partnership with Canary Wharf Group. Award-winning development with focus on sustainable living and premium finishes.'
    WHEN p.name ILIKE '%manchester%' THEN 
      'Urban Splash development focusing on converting historic buildings into modern residential spaces while preserving architectural heritage.'
    ELSE 
      'Developed by Bellway Homes, one of the UK''s leading housebuilders, known for quality construction and attention to detail in residential developments.'
  END as developer_info,
  NOW() as created_at,
  NOW() as updated_at
FROM properties p
ON CONFLICT (property_id) DO UPDATE SET
  property_type = EXCLUDED.property_type,
  bedrooms = EXCLUDED.bedrooms,
  bathrooms = EXCLUDED.bathrooms,
  square_footage = EXCLUDED.square_footage,
  full_address = EXCLUDED.full_address,
  city = EXCLUDED.city,
  updated_at = NOW();

-- ========================================
-- 2. PROPERTY FINANCIALS (No ID column)
-- ========================================

INSERT INTO property_financials (
  property_id,
  purchase_price,
  annual_yield_pct,
  annual_rental_income_gross,
  annual_rental_income_net,
  operating_costs,
  property_valuation_latest,
  reserve_fund_allocation,
  cap_rate,
  roi_estimate,
  created_at,
  updated_at
)
SELECT 
  p.id as property_id,
  ROUND((p.funding_goal_usdc * 1.25)::NUMERIC, 0) as purchase_price,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 5.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 6.5
    ELSE 6.0
  END as annual_yield_pct,
  ROUND(((p.funding_goal_usdc * 1.25) * 0.06)::NUMERIC, 0) as annual_rental_income_gross,
  ROUND(((p.funding_goal_usdc * 1.25) * 0.048)::NUMERIC, 0) as annual_rental_income_net,
  ROUND(((p.funding_goal_usdc * 1.25) * 0.012)::NUMERIC, 0) as operating_costs,
  ROUND((p.funding_goal_usdc * 1.25 * 1.08)::NUMERIC, 0) as property_valuation_latest,
  ROUND(((p.funding_goal_usdc * 1.25) * 0.02)::NUMERIC, 0) as reserve_fund_allocation,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 4.8
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 5.8
    ELSE 5.3
  END as cap_rate,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 8.5
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN 9.5
    ELSE 9.0
  END as roi_estimate,
  NOW() as created_at,
  NOW() as updated_at
FROM properties p
ON CONFLICT (property_id) DO UPDATE SET
  purchase_price = EXCLUDED.purchase_price,
  annual_yield_pct = EXCLUDED.annual_yield_pct,
  annual_rental_income_gross = EXCLUDED.annual_rental_income_gross,
  annual_rental_income_net = EXCLUDED.annual_rental_income_net,
  operating_costs = EXCLUDED.operating_costs,
  property_valuation_latest = EXCLUDED.property_valuation_latest,
  reserve_fund_allocation = EXCLUDED.reserve_fund_allocation,
  cap_rate = EXCLUDED.cap_rate,
  roi_estimate = EXCLUDED.roi_estimate,
  updated_at = NOW();

-- ========================================
-- 3. UPDATE PROPERTY_TOKEN_DETAILS
-- ========================================

UPDATE property_token_details 
SET 
  available_shares = CASE 
    WHEN total_shares IS NOT NULL THEN total_shares - (total_shares * 0.1)::INT
    ELSE 900
  END,
  updated_at = NOW()
WHERE available_shares IS NULL;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check if data was inserted
SELECT 'Property Details' as table_name, COUNT(*) as count FROM property_details
UNION ALL
SELECT 'Property Financials', COUNT(*) FROM property_financials
UNION ALL  
SELECT 'Property Token Details', COUNT(*) FROM property_token_details;

-- Sample data check
SELECT 
  p.name,
  pd.property_type,
  pd.bedrooms,
  pd.city,
  pf.annual_yield_pct,
  pf.purchase_price
FROM properties p
LEFT JOIN property_details pd ON p.id = pd.property_id
LEFT JOIN property_financials pf ON p.id = pf.property_id
LIMIT 3; 