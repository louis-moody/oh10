# Finalize Crowdfunding Flow

## Overview

The finalize crowdfunding flow is the final stage of the OpenHouse crowdfunding process where admins collect approved USDC from investors and mint property tokens. This is a production-safe, contract-integrated, irreversible settlement flow.

**Key Principle**: This process only occurs when funding goals are met and ensures perfect synchronization between on-chain transactions and off-chain database records.

---

## Prerequisites

### Funding Requirements
✅ Property funding goal is 100% met  
✅ All investor USDC approvals are recorded in `payment_authorizations`  
✅ Funding deadline has passed  
✅ Property status is `active`  

### Technical Requirements
✅ Token contract is deployed for the property  
✅ Admin has `OPERATOR_PRIVATE_KEY` with sufficient gas  
✅ Treasury wallet address is configured  
✅ USDC contract addresses are configured for the network  

---

## Process Flow

### Step 1: Token Contract Deployment

**Trigger**: Admin clicks "Deploy Token" when funding goal is 100% met

**Conditions**:
- Property status: `active`
- Funding progress: `>= 100%`
- Token contract: `not deployed`

**Process**:
1. Validate funding goal completion from `payment_authorizations`
2. Deploy PropertyShareToken contract (or simulate)
3. Update property with `token_contract_address`
4. Change property status to `funded`
5. Create `property_token_details` record

### Step 2: USDC Collection and Token Minting

**Trigger**: Admin clicks "Collect USDC" when token is deployed

**Conditions**:
- Property status: `funded`
- Token contract: `deployed`
- Reservations: `approved` status exists

**Process**:
1. Fetch all approved reservations for the property
2. For each reservation:
   - Call `USDC.transferFrom(investor, treasury, amount)`
   - Call `PropertyToken.mintTo(investor, tokens)`
   - Update `payment_authorizations` with transaction hashes
   - Create `user_holdings` record
   - Log transactions in `transactions` table
3. Update property status based on success rate

---

## API Endpoints

### POST `/api/admin/deploy-token`

Deploys the PropertyShareToken contract for a fully funded property.

**Request**:
```json
{
  "property_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Token contract deployed successfully",
  "deployment": {
    "property_id": "uuid",
    "contract_address": "0x...",
    "token_name": "Property Name Shares",
    "token_symbol": "OHPROP",
    "deployment_hash": "0x..."
  }
}
```

**Validations**:
- Admin authentication and authorization
- Property exists and is `active`
- Funding goal is 100% met
- Token not already deployed

### POST `/api/admin/collect-usdc`

Collects USDC from approved reservations and mints property tokens.

**Request**:
```json
{
  "property_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "USDC collection and token minting completed",
  "summary": {
    "total_reservations": 15,
    "successful_collections": 15,
    "failed_collections": 0,
    "total_amount_collected": 150000,
    "property_status": "funded"
  },
  "processed_reservations": [
    {
      "wallet_address": "0x...",
      "usdc_amount": 10000,
      "token_amount": 1000,
      "transfer_hash": "0x...",
      "mint_hash": "0x...",
      "status": "success"
    }
  ]
}
```

**Validations**:
- Admin authentication and authorization
- Property exists and is `funded`
- Token contract is deployed
- Approved reservations exist
- Funding deadline has passed

---

## Database Updates

### payment_authorizations Table Updates

**Status Flow**: `approved` → `transferred` (success) or `failed` (error)

**Fields Updated on Success**:
```sql
UPDATE payment_authorizations SET
  payment_status = 'transferred',
  transfer_hash = '0x...',
  transfer_timestamp = NOW(),
  tokens_minted = true,
  mint_hash = '0x...',
  mint_timestamp = NOW(),
  updated_at = NOW()
WHERE id = reservation_id;
```

**Fields Updated on Failure**:
```sql
UPDATE payment_authorizations SET
  payment_status = 'failed',
  updated_at = NOW()
WHERE id = reservation_id;
```

### user_holdings Table Creation

**New Record per Successful Mint**:
```sql
INSERT INTO user_holdings (
  wallet_address,
  property_id,
  token_balance,
  total_invested_usdc,
  average_purchase_price,
  created_at,
  updated_at
) VALUES (
  investor_wallet,
  property_id,
  token_amount,
  usdc_amount,
  price_per_token,
  NOW(),
  NOW()
) ON CONFLICT (wallet_address, property_id) 
DO UPDATE SET
  token_balance = token_balance + EXCLUDED.token_balance,
  total_invested_usdc = total_invested_usdc + EXCLUDED.total_invested_usdc,
  average_purchase_price = total_invested_usdc / token_balance,
  updated_at = NOW();
```

### transactions Table Logging

**Two Records per Successful Processing**:
```sql
-- USDC Collection Transaction
INSERT INTO transactions (
  user_address,
  property_id,
  type,
  amount,
  tx_hash,
  created_at
) VALUES (
  investor_wallet,
  property_id,
  'usdc_collection',
  usdc_amount,
  transfer_hash,
  NOW()
);

-- Token Minting Transaction  
INSERT INTO transactions (
  user_address,
  property_id,
  type,
  amount,
  tx_hash,
  created_at
) VALUES (
  investor_wallet,
  property_id,
  'token_mint',
  token_amount,
  mint_hash,
  NOW()
);
```

### properties Table Status Update

**Final Status Update**:
```sql
UPDATE properties SET
  status = 'funded',  -- Remains 'funded' after successful collection
  updated_at = NOW()
WHERE id = property_id;
```

---

## Smart Contract Integration

### USDC Collection

**Contract**: USDC Token (ERC20)  
**Function**: `transferFrom(from, to, amount)`  
**Parameters**:
- `from`: Investor wallet address
- `to`: Treasury wallet address  
- `amount`: USDC amount in wei (6 decimals)

**Prerequisites**:
- Investor has approved treasury to spend USDC
- Investor has sufficient USDC balance
- Treasury address is configured correctly

### Token Minting

**Contract**: PropertyShareToken (Custom ERC20)  
**Function**: `mintTo(to, amount)`  
**Parameters**:
- `to`: Investor wallet address
- `amount`: Number of property tokens to mint

**Prerequisites**:
- Contract is deployed and address is stored
- Operator has minting permissions
- Minting is not completed
- Token amount doesn't exceed total shares

---

## Error Handling

### Possible Failure Scenarios

1. **USDC Transfer Failures**:
   - Insufficient allowance (user revoked approval)
   - Insufficient balance (user spent USDC)
   - Gas estimation failures
   - Network connectivity issues

2. **Token Minting Failures**:
   - Contract address invalid
   - Operator lacks permissions
   - Minting already completed
   - Token amount exceeds available shares

3. **Database Update Failures**:
   - Constraint violations
   - Network connectivity issues
   - Service role key issues

### Error Recovery

**Per-Reservation Error Handling**:
- Each reservation is processed independently
- Failed reservations are marked as `failed` status
- Successful reservations continue processing
- Final summary reports success/failure counts

**Transaction Atomicity**:
- USDC transfer must succeed before token minting
- Database updates happen after both contract calls
- Failed operations don't block other reservations

---

## Security Considerations

### Private Key Management

⚠️ **Critical**: The `OPERATOR_PRIVATE_KEY` controls financial operations

**Recommendations**:
- Use hardware wallet or HSM in production
- Implement key rotation policies
- Monitor all operator transactions
- Use multi-signature wallets where possible

### Transaction Monitoring

**Required Monitoring**:
- All USDC transfers to treasury
- All token minting transactions
- Failed transaction analysis
- Gas usage optimization

### Backup Procedures

**Manual Recovery Options**:
- Re-run failed reservations individually
- Verify all on-chain vs database records
- Handle partial completion scenarios
- Emergency pause mechanisms

---

## Admin UI Workflow

### 1. Property Status Monitoring

**Admin Dashboard Shows**:
- Funding progress per property
- Investor count and amounts
- Available actions based on status

### 2. Token Deployment

**Button**: "Deploy Token"  
**Enabled When**: `active` + `100% funded` + `no contract`  
**Result**: Property becomes `funded`, enables USDC collection

### 3. USDC Collection

**Button**: "Collect USDC"  
**Enabled When**: `funded` + `contract deployed`  
**Result**: All reservations processed, tokens minted, holdings created

### 4. Progress Tracking

**Real-time Updates**:
- Processing status per investor
- Success/failure counts
- Transaction hash links
- Error messages and details

---

## Testing Checklist

### Pre-deployment Testing

- [ ] Deploy test PropertyShareToken contracts
- [ ] Verify USDC approval and transfer flows
- [ ] Test token minting with various amounts
- [ ] Validate database update sequences
- [ ] Test error scenarios and recovery

### Production Validation

- [ ] Verify treasury receives USDC correctly
- [ ] Confirm investors receive correct token amounts
- [ ] Validate user_holdings records are accurate
- [ ] Check transaction logging completeness
- [ ] Monitor gas usage and optimization

### Post-completion Verification

- [ ] Reconcile on-chain vs database records
- [ ] Verify total USDC collected matches expectations
- [ ] Confirm all investor tokens are minted correctly
- [ ] Validate property status transitions
- [ ] Check for any orphaned or incomplete records

---

## Deployment Requirements

### Environment Variables

```env
# Required for USDC Collection and Token Minting
TREASURY_WALLET_ADDRESS=0x...
OPERATOR_PRIVATE_KEY=0x...
NEXT_PUBLIC_BASE_CHAIN_ID=84532
```

### Database Permissions

- Service role key for admin operations
- RLS policies for user data protection
- Proper foreign key relationships
- Transaction logging enabled

### Smart Contract Setup

- PropertyShareToken contracts deployed per property
- Operator wallet has minting permissions
- Treasury wallet configured for USDC collection
- Gas estimation and fee management

---

This finalize crowdfunding flow ensures complete transparency, proper error handling, and perfect synchronization between on-chain operations and off-chain records, maintaining the integrity of the OpenHouse investment platform. 