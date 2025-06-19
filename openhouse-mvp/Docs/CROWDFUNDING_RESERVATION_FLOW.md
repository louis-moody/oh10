# OpenHouse Crowdfunding Reservation Flow

## Overview

The crowdfunding reservation flow enables authenticated users to reserve property shares by approving USDC transfers to OpenHouse treasury, with payment collection and token minting occurring only when funding goals are reached.

**Key Principle**: No payment is taken until the funding goal is met, ensuring user funds are safe and the platform maintains transparency.

---

## Architecture

### Frontend Components

#### 1. Property Detail Page (`src/app/properties/[id]/page.tsx`)
- **Dynamic property data** from Supabase
- **Real-time funding progress** from `payment_authorizations` table
- **Wallet connection** requirement for reservations
- **Reserve button** with validation logic

#### 2. Reservation Modal (`src/app/components/ReservationModal.tsx`)
- **Dual input system**: USDC amount or share count (auto-converts)
- **Real-time validation**: Balance checks, deadline validation, share availability
- **USDC approval flow**: Calls `approve()` on USDC contract for treasury address
- **Supabase integration**: Stores reservation after successful approval

### Backend API

#### Reservation Endpoint (`src/app/api/reservations/route.ts`)
- **JWT authentication** via secure cookies
- **Property validation**: Status, deadline, share availability
- **Price calculation verification** 
- **Upsert reservations** with conflict resolution

### Database Schema

#### Core Table: `payment_authorizations`
```sql
CREATE TABLE payment_authorizations (
    id UUID PRIMARY KEY,
    property_id UUID REFERENCES properties(id),
    wallet_address TEXT NOT NULL,
    usdc_amount DECIMAL(20,6) NOT NULL,
    token_amount INTEGER NOT NULL,
    approval_hash TEXT,
    approval_timestamp TIMESTAMP,
    payment_status TEXT DEFAULT 'pending',
    transfer_hash TEXT,
    transfer_timestamp TIMESTAMP,
    tokens_minted BOOLEAN DEFAULT FALSE,
    mint_hash TEXT,
    mint_timestamp TIMESTAMP,
    UNIQUE(property_id, wallet_address)
);
```

**Status Flow**: `pending` → `approved` → `transferred` → (tokens minted)

---

## User Flow

### 1. Property Discovery
```
User browses properties → Clicks property → Views detail page
```

### 2. Reservation Process
```
Connect Wallet → Enter USDC/Share amount → Validate inputs → 
Sign USDC approval → Store reservation → Confirmation
```

### 3. Funding Completion (Admin)
```
Funding goal reached → Admin runs finalization script → 
Collect USDC via transferFrom → Mint tokens to users → 
Update database status
```

---

## Smart Contract Integration

### USDC Approval Flow
```solidity
// User approves OpenHouse treasury to spend USDC
USDC.approve(TREASURY_ADDRESS, amount)

// Later: Admin collects when funding is complete
USDC.transferFrom(user, treasury, amount)
```

### Treasury Address
```
Base Sepolia: 0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819
Base Mainnet: 0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819
```

### USDC Contract Addresses
```
Base Sepolia: 0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7
Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

---

## Validation Rules

### Frontend Validation
- ✅ Wallet connection required
- ✅ Property status must be 'active'
- ✅ Funding deadline not passed
- ✅ Sufficient USDC balance
- ✅ Available shares remaining
- ✅ Valid amount inputs (> 0)

### Backend Validation
- ✅ JWT authentication
- ✅ Property exists and active
- ✅ Price calculation accuracy
- ✅ Share availability check
- ✅ Deadline validation
- ✅ Duplicate reservation handling

### Admin Script Validation
- ✅ Funding goal reached
- ✅ USDC allowance sufficient
- ✅ Token contract exists
- ✅ Minting not completed

---

## Security Features

### Authentication
- **JWT tokens** in secure HttpOnly cookies
- **Session validation** via Supabase RPC
- **Wallet address verification** through SIWE

### Financial Security
- **No direct payments** until funding complete
- **Approval-based system** prevents unauthorized transfers
- **Atomic operations** for collect + mint
- **Comprehensive logging** of all transactions

### Data Integrity
- **Unique constraints** prevent duplicate reservations
- **Decimal precision** handling for USDC (6 decimals)
- **Status tracking** throughout entire flow
- **Error handling** with rollback capability

---

## Admin Operations

### Funding Finalization Script
```bash
# Base Sepolia
npm run admin:finalize-funding:sepolia

# Base Mainnet  
npm run admin:finalize-funding:mainnet
```

### Script Operations
1. **Fetch active properties** with deployed tokens
2. **Calculate funding progress** from reservations
3. **Verify funding goals** are met
4. **Process each reservation**:
   - Check USDC allowance
   - Transfer USDC to treasury
   - Mint tokens to user
   - Update database status
5. **Complete minting** if 95%+ funded
6. **Update property status** to 'funded'

---

## Error Handling

### Common Errors & Solutions

#### "Insufficient USDC balance"
- **Cause**: User doesn't have enough USDC
- **Solution**: User needs to acquire USDC first

#### "Not enough shares available"
- **Cause**: Property is over-reserved
- **Solution**: User reduces reservation amount

#### "Funding deadline has passed"
- **Cause**: Property funding period ended
- **Solution**: Property no longer accepts reservations

#### "Insufficient allowance" (Admin script)
- **Cause**: User revoked USDC approval
- **Solution**: Contact user to re-approve

### Error Recovery
- **Failed transfers** marked as 'failed' status
- **Partial funding** completion supported
- **Manual intervention** possible via database
- **Transaction logging** for audit trail

---

## Testing Scenarios

### Unit Tests Required
- [ ] Reservation modal input validation
- [ ] USDC approval flow
- [ ] Database upsert operations
- [ ] Admin script collection logic

### Integration Tests Required
- [ ] End-to-end reservation flow
- [ ] Funding goal completion
- [ ] Error handling scenarios
- [ ] Multi-user reservations

### Manual Testing Checklist
- [ ] Connect wallet and reserve shares
- [ ] Verify USDC approval transaction
- [ ] Check database reservation storage
- [ ] Test funding completion flow
- [ ] Validate token minting

---

## Monitoring & Analytics

### Key Metrics
- **Reservation success rate**
- **USDC approval completion rate** 
- **Funding goal achievement time**
- **Token minting success rate**

### Event Tracking
```typescript
// Frontend events
ReservationStarted
ReservationCompleted
ReservationFailed

// Backend events  
ReservationStored
FundingGoalReached
TokensMinted
```

### Database Queries
```sql
-- Funding progress by property
SELECT 
  p.name,
  SUM(pa.usdc_amount) as raised,
  p.funding_goal_usdc,
  (SUM(pa.usdc_amount) / p.funding_goal_usdc * 100) as progress
FROM properties p
LEFT JOIN payment_authorizations pa ON p.id = pa.property_id
WHERE pa.payment_status = 'approved'
GROUP BY p.id;

-- User reservation summary
SELECT 
  wallet_address,
  COUNT(*) as reservations,
  SUM(usdc_amount) as total_reserved
FROM payment_authorizations
WHERE payment_status = 'approved'
GROUP BY wallet_address;
```

---

## Deployment Checklist

### Environment Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `APP_SESSION_JWT_SECRET`
- [ ] `NEXT_PUBLIC_BASE_CHAIN_ID`
- [ ] `DEPLOYER_PRIVATE_KEY`

### Database Setup
- [ ] Run `contracts-integration-migration.sql`
- [ ] Verify RLS policies
- [ ] Test helper functions
- [ ] Validate indexes

### Smart Contract Deployment
- [ ] Deploy PropertyShareToken contracts
- [ ] Verify contract addresses in database
- [ ] Test USDC approval flow
- [ ] Validate treasury permissions

### Frontend Configuration
- [ ] Update USDC contract addresses
- [ ] Configure treasury address
- [ ] Test wallet connection
- [ ] Verify reservation modal

---

## Future Enhancements

### Planned Features
- **Partial reservations**: Allow users to reserve less than full amounts
- **Reservation expiry**: Time-limited reservations
- **Referral system**: Incentivize user acquisition
- **Yield preview**: Show estimated rental returns

### Technical Improvements
- **Batch processing**: Handle multiple reservations efficiently
- **Gas optimization**: Reduce transaction costs
- **Mobile optimization**: Improve mobile UX
- **Notification system**: Email/SMS updates

---

## Compliance Considerations

### Regulatory Alignment
- **No custody of funds** until goal reached
- **Clear disclosure** of risks and terms
- **Transparent pricing** and fee structure
- **User consent** for all transactions

### Audit Trail
- **Complete transaction history** in database
- **On-chain verification** via transaction hashes
- **User action logging** for compliance
- **Admin operation tracking** for oversight

---

This crowdfunding reservation flow provides a secure, transparent, and user-friendly way to enable property investment while maintaining regulatory compliance and financial security. 