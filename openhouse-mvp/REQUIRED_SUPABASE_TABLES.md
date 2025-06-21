# OpenHouse Required Supabase Tables

## ✅ **Core Required Tables**

### 1. `properties` 
**Purpose**: Main property listings
**Status**: KEEP - Core table
```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  price_per_token DECIMAL(10,2),
  total_shares INTEGER,
  funding_goal_usdc DECIMAL(20,6),
  funding_deadline TIMESTAMP,
  status TEXT CHECK (status IN ('active', 'funded', 'completed', 'draft')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. `property_token_details`
**Purpose**: Token contract information for live properties
**Status**: KEEP - Essential for trading
```sql
CREATE TABLE property_token_details (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  token_name TEXT,
  token_symbol TEXT,
  total_shares INTEGER,
  available_shares INTEGER,
  contract_address TEXT,
  orderbook_contract_address TEXT,
  yield_distributor_address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. `property_details`
**Purpose**: Detailed property information for Details tab
**Status**: KEEP - New PRD requirement
```sql
CREATE TABLE property_details (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  property_type TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  square_footage INTEGER,
  full_address TEXT,
  postcode TEXT,
  city TEXT,
  ownership_model TEXT,
  lease_information TEXT,
  amenities TEXT[],
  developer_info TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4. `property_financials`
**Purpose**: Financial data for Financials tab
**Status**: KEEP - New PRD requirement
```sql
CREATE TABLE property_financials (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  purchase_price DECIMAL(20,2),
  annual_yield_pct DECIMAL(5,2),
  annual_rental_income_gross DECIMAL(20,2),
  annual_rental_income_net DECIMAL(20,2),
  operating_costs DECIMAL(20,2),
  property_valuation_latest DECIMAL(20,2),
  reserve_fund_allocation DECIMAL(20,2),
  cap_rate DECIMAL(5,2),
  roi_estimate DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5. `payment_authorizations`
**Purpose**: USDC approvals for reservations
**Status**: KEEP - Core crowdfunding
```sql
-- Keep existing structure
```

### 6. `transactions`
**Purpose**: Completed trades and transfers
**Status**: KEEP - Core trading functionality
```sql
-- Keep existing structure
```

### 7. `user_holdings`
**Purpose**: Track user token ownership
**Status**: KEEP - Essential for portfolio
```sql
-- Keep existing structure
```

### 8. `users`
**Purpose**: User authentication and profiles
**Status**: KEEP - Core auth
```sql
-- Keep existing structure
```

## ⚠️ **Activity Tables - CONSOLIDATE NEEDED**

### Current Issue: Multiple Activity Tables
You have both `orderbook_activity` and `property_activity` which is causing confusion.

**Recommendation**: Use ONE activity table

### Option A: Keep `orderbook_activity` and alias it
```sql
-- Rename orderbook_activity to property_activity
ALTER TABLE orderbook_activity RENAME TO property_activity;

-- Update schema to match PropertyActivity interface
ALTER TABLE property_activity 
  RENAME COLUMN action_type TO activity_type;
ALTER TABLE property_activity 
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(20,6);
```

### Option B: Create unified `property_activity` table
```sql
CREATE TABLE property_activity (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  activity_type TEXT CHECK (activity_type IN ('buy_order', 'sell_order', 'trade_executed', 'yield_distributed')),
  wallet_address TEXT,
  share_count INTEGER,
  price_per_share DECIMAL(10,6),
  total_amount DECIMAL(20,6),
  transaction_hash TEXT,
  block_number BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🗑️ **Tables You Can DELETE**

### 1. `order_book_state`
**Reason**: Redundant - order data should be in trading system

### 2. `price_history` 
**Reason**: Can be derived from transactions table

### 3. `yield_claims`
**Reason**: Handled by smart contracts directly

### 4. `yield_distributions`
**Reason**: Handled by smart contracts directly

### 5. `active_sessions`
**Reason**: Use JWT tokens instead

### 6. `admin_settings`
**Reason**: Move to environment variables

## 🔧 **Immediate Fixes Needed**

### 1. Populate Empty Tables
Your `property_details`, `property_financials`, and `property_activity` tables are empty.

### 2. Fix Activity Tracking
The trading modal needs to write to `property_activity` table when orders are placed.

### 3. Consolidate Activity Tables
Choose either `orderbook_activity` OR `property_activity` - not both.

## 📝 **Sample Data Inserts**

### For property_details:
```sql
INSERT INTO property_details (property_id, property_type, bedrooms, bathrooms, square_footage, full_address, postcode, city, ownership_model)
VALUES ('your-property-id', 'Residential', 2, 1, 850, '123 Sample Street', 'SW1A 1AA', 'London', 'SPV Structure');
```

### For property_financials:
```sql
INSERT INTO property_financials (property_id, purchase_price, annual_yield_pct, annual_rental_income_gross, annual_rental_income_net, operating_costs, property_valuation_latest, reserve_fund_allocation)
VALUES ('your-property-id', 250000, 6.5, 18000, 16250, 1750, 265000, 2500);
```

## 🎯 **Action Plan**

1. **Keep**: `properties`, `property_token_details`, `property_details`, `property_financials`, `payment_authorizations`, `transactions`, `user_holdings`, `users`

2. **Delete**: `order_book_state`, `price_history`, `yield_claims`, `yield_distributions`, `active_sessions`, `admin_settings`

3. **Consolidate**: Merge `orderbook_activity` and `property_activity` into one table

4. **Populate**: Add sample data to empty tables

5. **Fix**: Update trading modal to write activity records 