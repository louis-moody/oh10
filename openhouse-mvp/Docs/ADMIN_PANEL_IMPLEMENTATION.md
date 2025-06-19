# Admin Panel Implementation

## Overview

The admin panel provides internal control over the crowdfunding lifecycle, allowing authorized administrators to collect USDC payments and deploy token contracts when funding goals are met.

## Features

### Access Control
- Admin access controlled by `is_admin` column in users table
- Non-admin users are redirected to home page
- JWT-based authentication with session validation

### Property Management
- View all properties with real-time funding status
- Calculate funding progress from `payment_authorizations` table
- Display investor count and raised amounts
- Status-based action buttons

### USDC Collection
- Enabled when funding goal is 100% met
- Processes all approved reservations
- Updates payment status to 'transferred'
- Changes property status to 'funded'
- Logs all transaction results

### Token Deployment
- Enabled after USDC collection is complete
- Creates `property_token_details` record
- Simulates contract deployment (production would use Hardhat)
- Updates property with contract address
- Changes status to 'deployed'

## API Endpoints

### `POST /api/admin/collect-usdc`
- Verifies admin access
- Validates funding goal completion
- Processes USDC transfers from approved reservations
- Updates payment statuses and property status

### `POST /api/admin/deploy-token`
- Verifies admin access
- Validates property is in 'funded' status
- Creates property token details
- Simulates contract deployment
- Updates property with deployment info

## Database Tables

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    email TEXT,
    profile_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Property Status Flow
1. `active` - Accepting reservations
2. `funded` - Goal reached, USDC collected
3. `deployed` - Token contract deployed

## Security Features

- JWT authentication with secure HttpOnly cookies
- Row Level Security (RLS) on Supabase tables
- Admin access verification on all endpoints
- Session validation via middleware
- Comprehensive input validation

## Usage

1. Admin logs in with wallet authentication
2. Admin link appears in header navigation
3. Admin dashboard shows property table
4. Action buttons enable based on property state:
   - **Collect USDC**: When funding goal is 100% met
   - **Deploy Token**: After USDC collection is complete

## Production Considerations

- Replace simulated contract deployment with real Hardhat scripts
- Implement actual USDC transfer logic via ethers.js
- Add comprehensive error handling and retry logic
- Implement audit logging for all admin actions
- Add admin user management interface
- Set up monitoring and alerting for critical operations

## Compliance

- All actions are logged for audit purposes
- Real-time funding calculations prevent over-collection
- Property status updates maintain clear lifecycle tracking
- Admin access is tightly controlled and verifiable 