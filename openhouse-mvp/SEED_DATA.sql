-- OpenHouse Seed Data - Consistent with Existing Properties
-- Run this in Supabase SQL Editor

-- ========================================
-- 1. PROPERTY DETAILS SEED DATA
-- ========================================

INSERT INTO property_details (
  id,
  property_id, 
  property_type, 
  bedrooms, 
  bathrooms, 
  square_footage, 
  full_address, 
  postcode, 
  city, 
  ownership_model, 
  lease_information, 
  amenities, 
  developer_info,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid() as id,
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
    ELSE 2  -- Default to 2 bedroom
  END as bedrooms,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN 1
    WHEN p.name ILIKE '%1 bed%' OR p.name ILIKE '%one bed%' THEN 1
    WHEN p.name ILIKE '%3 bed%' OR p.name ILIKE '%three bed%' THEN 2
    WHEN p.name ILIKE '%4 bed%' OR p.name ILIKE '%four bed%' THEN 3
    ELSE 1  -- Default to 1 bathroom
  END as bathrooms,
  CASE 
    WHEN p.name ILIKE '%studio%' THEN 450
    WHEN p.name ILIKE '%1 bed%' OR p.name ILIKE '%one bed%' THEN 650
    WHEN p.name ILIKE '%3 bed%' OR p.name ILIKE '%three bed%' THEN 1100
    WHEN p.name ILIKE '%4 bed%' OR p.name ILIKE '%four bed%' THEN 1400
    ELSE 850  -- Default 2 bed size
  END as square_footage,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 
      CASE (RANDOM() * 5)::INT
        WHEN 0 THEN '45 Canary Wharf, London'
        WHEN 1 THEN '123 Kings Cross Road, London'
        WHEN 2 THEN '67 Shoreditch High Street, London'
        WHEN 3 THEN '89 Bermondsey Street, London'
        ELSE '12 Camden Lock Place, London'
      END
    WHEN p.name ILIKE '%manchester%' THEN 
      CASE (RANDOM() * 3)::INT
        WHEN 0 THEN '234 Deansgate, Manchester'
        WHEN 1 THEN '56 Northern Quarter, Manchester'
        ELSE '78 Spinningfields, Manchester'
      END
    WHEN p.name ILIKE '%birmingham%' THEN 
      CASE (RANDOM() * 3)::INT
        WHEN 0 THEN '90 Broad Street, Birmingham'
        WHEN 1 THEN '34 Jewellery Quarter, Birmingham'
        ELSE '156 Digbeth, Birmingham'
      END
    ELSE '45 High Street, ' || CASE (RANDOM() * 3)::INT
        WHEN 0 THEN 'Bristol'
        WHEN 1 THEN 'Leeds' 
        ELSE 'Liverpool'
      END
  END as full_address,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 
      CASE (RANDOM() * 5)::INT
        WHEN 0 THEN 'E14 5AB'
        WHEN 1 THEN 'N1C 4QP'
        WHEN 2 THEN 'E1 6JE'
        WHEN 3 THEN 'SE1 3UW'
        ELSE 'NW1 7BY'
      END
    WHEN p.name ILIKE '%manchester%' THEN 'M3 4LZ'
    WHEN p.name ILIKE '%birmingham%' THEN 'B1 1AA'
    ELSE 'BS1 4DJ'
  END as postcode,
  CASE 
    WHEN p.name ILIKE '%london%' THEN 'London'
    WHEN p.name ILIKE '%manchester%' THEN 'Manchester'
    WHEN p.name ILIKE '%birmingham%' THEN 'Birmingham'
    WHEN p.name ILIKE '%bristol%' THEN 'Bristol'
    WHEN p.name ILIKE '%leeds%' THEN 'Leeds'
    WHEN p.name ILIKE '%liverpool%' THEN 'Liverpool'
    ELSE 'London'  -- Default to London
  END as city,
  'Special Purpose Vehicle (SPV) - Investors hold tokenized shares representing beneficial ownership in the property-owning SPV. Legal title held by SPV, managed by OpenHouse as asset manager.' as ownership_model,
  CASE 
    WHEN (RANDOM() * 2)::INT = 0 THEN 
      'Buy-to-let property with assured shorthold tenancy. Current lease expires ' || 
      TO_CHAR(CURRENT_DATE + INTERVAL '6 months' + (RANDOM() * 365 * 2)::INT * INTERVAL '1 day', 'Month YYYY') ||
      '. Rent reviews annually in line with RPI increases.'
    ELSE 
      'Freehold property available for immediate occupation or rental. No existing tenancy agreements. ' ||
      'Property suitable for buy-to-let investment with estimated rental yield shown in financials.'
  END as lease_information,
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
  postcode = EXCLUDED.postcode,
  city = EXCLUDED.city,
  updated_at = NOW();

-- ========================================
-- 2. PROPERTY FINANCIALS SEED DATA
-- ========================================

INSERT INTO property_financials (
  id,
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
  gen_random_uuid() as id,
  p.id as property_id,
  -- Calculate purchase price from funding goal (assuming 80% LTV)
  ROUND((p.funding_goal_usdc * 1.25)::NUMERIC, 0) as purchase_price,
  -- Annual yield between 4.5% and 7.5% based on location
  CASE 
    WHEN p.name ILIKE '%london%' THEN ROUND((4.5 + RANDOM() * 2)::NUMERIC, 1)  -- 4.5-6.5% for London
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN ROUND((5.5 + RANDOM() * 2)::NUMERIC, 1)  -- 5.5-7.5% for regional cities
    ELSE ROUND((5.0 + RANDOM() * 2)::NUMERIC, 1)  -- 5.0-7.0% for other areas
  END as annual_yield_pct,
  -- Calculate gross rental income from purchase price and yield
  ROUND(((p.funding_goal_usdc * 1.25) * 
    CASE 
      WHEN p.name ILIKE '%london%' THEN (4.5 + RANDOM() * 2) / 100
      WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN (5.5 + RANDOM() * 2) / 100
      ELSE (5.0 + RANDOM() * 2) / 100
    END)::NUMERIC, 0) as annual_rental_income_gross,
  -- Net income = gross minus operating costs (typically 15-25% of gross)
  ROUND(((p.funding_goal_usdc * 1.25) * 
    CASE 
      WHEN p.name ILIKE '%london%' THEN (4.5 + RANDOM() * 2) / 100
      WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN (5.5 + RANDOM() * 2) / 100
      ELSE (5.0 + RANDOM() * 2) / 100
    END * 0.8)::NUMERIC, 0) as annual_rental_income_net,
  -- Operating costs (insurance, management, maintenance, void periods)
  ROUND(((p.funding_goal_usdc * 1.25) * 
    CASE 
      WHEN p.name ILIKE '%london%' THEN (4.5 + RANDOM() * 2) / 100
      WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN (5.5 + RANDOM() * 2) / 100
      ELSE (5.0 + RANDOM() * 2) / 100
    END * 0.2)::NUMERIC, 0) as operating_costs,
  -- Current valuation (5-15% above purchase price for recent appreciation)
  ROUND((p.funding_goal_usdc * 1.25 * (1.05 + RANDOM() * 0.1))::NUMERIC, 0) as property_valuation_latest,
  -- Reserve fund (typically 3-6 months of rental income)
  ROUND(((p.funding_goal_usdc * 1.25) * 
    CASE 
      WHEN p.name ILIKE '%london%' THEN (4.5 + RANDOM() * 2) / 100
      WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN (5.5 + RANDOM() * 2) / 100
      ELSE (5.0 + RANDOM() * 2) / 100
    END * 0.25)::NUMERIC, 0) as reserve_fund_allocation,
  -- Cap rate (similar to yield but slightly lower)
  CASE 
    WHEN p.name ILIKE '%london%' THEN ROUND((4.0 + RANDOM() * 1.5)::NUMERIC, 1)
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN ROUND((5.0 + RANDOM() * 1.5)::NUMERIC, 1)
    ELSE ROUND((4.5 + RANDOM() * 1.5)::NUMERIC, 1)
  END as cap_rate,
  -- ROI estimate (yield plus potential capital appreciation)
  CASE 
    WHEN p.name ILIKE '%london%' THEN ROUND((6.5 + RANDOM() * 3)::NUMERIC, 1)  -- 6.5-9.5% total return
    WHEN p.name ILIKE '%manchester%' OR p.name ILIKE '%birmingham%' THEN ROUND((7.5 + RANDOM() * 3)::NUMERIC, 1)  -- 7.5-10.5% total return
    ELSE ROUND((7.0 + RANDOM() * 3)::NUMERIC, 1)  -- 7.0-10.0% total return
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
-- 3. SAMPLE ACTIVITY DATA
-- ========================================

-- Add some sample trading activity for completed/funded properties
INSERT INTO property_activity (
  id,
  property_id,
  activity_type,
  wallet_address,
  share_count,
  price_per_share,
  total_amount,
  transaction_hash,
  created_at
)
SELECT 
  gen_random_uuid() as id,
  p.id as property_id,
  CASE (RANDOM() * 2)::INT 
    WHEN 0 THEN 'buy_order'
    ELSE 'sell_order'
  END as activity_type,
  '0x' || encode(gen_random_bytes(20), 'hex') as wallet_address,
  (10 + RANDOM() * 90)::INT as share_count,
  p.price_per_token,
  ROUND((p.price_per_token * (10 + RANDOM() * 90))::NUMERIC, 2) as total_amount,
  '0x' || encode(gen_random_bytes(32), 'hex') as transaction_hash,
  NOW() - (RANDOM() * 30)::INT * INTERVAL '1 day' as created_at
FROM properties p
WHERE p.status IN ('funded', 'completed')
ORDER BY RANDOM()
LIMIT 5;

-- Add a few more recent activities
INSERT INTO property_activity (
  id,
  property_id,
  activity_type,
  wallet_address,
  share_count,
  price_per_share,
  total_amount,
  transaction_hash,
  created_at
)
SELECT 
  gen_random_uuid() as id,
  p.id as property_id,
  'trade_executed' as activity_type,
  '0x' || encode(gen_random_bytes(20), 'hex') as wallet_address,
  (5 + RANDOM() * 25)::INT as share_count,
  p.price_per_token,
  ROUND((p.price_per_token * (5 + RANDOM() * 25))::NUMERIC, 2) as total_amount,
  '0x' || encode(gen_random_bytes(32), 'hex') as transaction_hash,
  NOW() - (RANDOM() * 7)::INT * INTERVAL '1 day' as created_at
FROM properties p
WHERE p.status IN ('funded', 'completed')
ORDER BY RANDOM()
LIMIT 3;

-- ========================================
-- 4. UPDATE PROPERTY_TOKEN_DETAILS
-- ========================================

-- Update existing property_token_details with additional fields
UPDATE property_token_details 
SET 
  available_shares = CASE 
    WHEN total_shares IS NOT NULL THEN total_shares - (total_shares * 0.1)::INT  -- 90% available
    ELSE 900  -- Default if total_shares is null
  END,
  updated_at = NOW()
WHERE available_shares IS NULL;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Run these to verify the data was inserted correctly:

-- SELECT 'Property Details Count' as table_name, COUNT(*) as count FROM property_details
-- UNION ALL
-- SELECT 'Property Financials Count', COUNT(*) FROM property_financials  
-- UNION ALL
-- SELECT 'Property Activity Count', COUNT(*) FROM property_activity;

-- SELECT 
--   p.name,
--   pd.property_type,
--   pd.bedrooms,
--   pd.bathrooms,
--   pd.city,
--   pf.annual_yield_pct,
--   pf.purchase_price
-- FROM properties p
-- LEFT JOIN property_details pd ON p.id = pd.property_id
-- LEFT JOIN property_financials pf ON p.id = pf.property_id
-- LIMIT 5; 