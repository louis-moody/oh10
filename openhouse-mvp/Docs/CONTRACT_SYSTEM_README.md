# OpenHouse Smart Contract System

A complete tokenized real estate investment platform on Base L2 with ERC20 property tokens, rental yield distribution, and P2P trading exchange.

## 🏗️ **Architecture Overview**

### **Phase 1: PropertyShareToken.sol** ✅ **IMPLEMENTED**
- ERC20-based property ownership tokens
- Fixed supply per property
- Admin-controlled minting after USDC payment
- Immutable deployment parameters from Supabase

### **Phase 2: YieldDistributor.sol** 🔄 **NEXT**
- USDC rental yield distribution to token holders
- Snapshot-based accounting
- Claimable yield per distribution round

### **Phase 3: OrderBookExchange.sol** 📋 **PLANNED**
- P2P trading with 0.5% protocol fees
- On-chain limit order book
- Atomic settlement with USDC

---

## 🔐 **Wallet Architecture**

**Fixed role-based wallet system with predefined addresses:**

```solidity
DEPLOYER:       0x71c835E77B2Cc377fcfd9a37685Fea81a334cb81  // Initial deployment only
TREASURY:       0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819  // Protocol fees & yield deposits
FALLBACK:       0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553  // Administrative recovery
OPERATOR:       0x88c245fBdbD7e8f75AEE3CCC274d411Cb001d4C2  // Automation & distribution
```

---

## 📦 **Contract Details**

### **PropertyShareToken.sol**

**Purpose:** ERC20 token representing fractional property ownership

**Key Features:**
- ✅ Constructor-based configuration (no hardcoded values)
- ✅ Fixed supply matching Supabase `properties.total_shares`
- ✅ Admin-only minting via `mintTo()`
- ✅ Automatic minting completion when fully allocated
- ✅ Funding progress tracking in basis points
- ✅ Deadline validation and expiration checking

**Events:**
```solidity
event TokensMinted(address indexed to, uint256 amount, uint256 totalMinted);
event MintingCompleted(uint256 totalSupply, uint256 timestamp);
event PropertyFunded(uint256 propertyId, uint256 totalAmount, uint256 timestamp);
```

**Constructor Parameters:**
```solidity
constructor(
    string memory _name,           // "OpenHouse Property [Name]"
    string memory _symbol,         // "OH[ID]"
    uint256 _propertyId,           // From properties.id
    uint256 _totalShares,          // From properties.total_shares
    uint256 _pricePerToken,        // From properties.price_per_token (USDC wei)
    uint256 _fundingGoalUsdc,      // From properties.funding_goal_usdc (USDC wei)
    uint256 _fundingDeadline,      // Unix timestamp
    address _treasury,             // TREASURY wallet
    address _operator              // OPERATOR wallet
)
```

---

## 🗄️ **Database Integration**

### **Core Tables Added:**

```sql
-- Token contract tracking
property_token_details (
    property_id,
    contract_address,
    token_name,
    token_symbol,
    total_shares,
    price_per_token,
    funding_goal_usdc,
    funding_deadline,
    treasury_address,
    operator_address,
    deployment_hash,
    minting_completed,
    tokens_minted
)

-- Payment flow tracking
payment_authorizations (
    property_id,
    user_wallet_address,
    usdc_amount,
    token_amount,
    payment_status,  -- 'pending', 'approved', 'transferred', 'failed'
    approval_hash,
    transfer_hash,
    mint_hash
)

-- User portfolio tracking
user_holdings (
    user_wallet_address,
    property_id,
    token_balance,
    total_invested_usdc,
    average_purchase_price
)

-- Complete transaction log
transactions (
    user_wallet_address,
    property_id,
    transaction_type,  -- 'purchase', 'yield_claim', 'trade_buy', 'trade_sell'
    transaction_hash,
    block_number,
    token_amount,
    usdc_amount,
    price_per_token
)
```

### **Helper Functions:**
```sql
-- Calculate real-time funding progress
SELECT * FROM get_property_funding_progress('property-uuid');

-- Validate payment authorization
SELECT validate_payment_authorization('property-uuid', 'wallet', 1000.0, 10);
```

---

## 🚀 **Deployment Process**

### **1. Environment Setup**
```bash
# Add to .env.local
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
BASESCAN_API_KEY=your_basescan_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Database Migration**
```sql
-- Run contracts-integration-migration.sql in Supabase SQL Editor
```

### **4. Deploy Contracts**
```bash
# Compile contracts
npm run contracts:compile

# Deploy to Base Sepolia
npm run contracts:deploy:sepolia

# Deploy to Base Mainnet (production)
npm run contracts:deploy:mainnet
```

### **5. Deployment Script Logic**
The deployment script:
1. ✅ Fetches active properties from Supabase without existing token contracts
2. ✅ Validates property data (shares > 0, deadline in future, etc.)
3. ✅ Deploys PropertyShareToken with constructor arguments from database
4. ✅ Updates Supabase with deployed contract address
5. ✅ Provides deployment summary with gas costs and transaction hashes

---

## 🧪 **Testing**

### **Unit Tests**
```bash
npm run contracts:test
```

**Test Coverage:**
- ✅ Constructor parameter validation
- ✅ Minting permissions and limits
- ✅ Automatic minting completion
- ✅ ERC20 transfer functionality
- ✅ View function accuracy
- ✅ Event emission verification
- ✅ Security access controls

---

## 🔄 **Integration Flow**

### **Property Token Creation:**
1. **Supabase:** Property created with `status: 'draft'`
2. **Admin:** Updates status to `'active'` when ready for funding
3. **Deploy Script:** Detects active properties without token contracts
4. **Smart Contract:** PropertyShareToken deployed with Supabase parameters
5. **Database:** Updated with `token_contract_address`

### **Investment Flow:**
1. **Frontend:** User selects token amount to purchase
2. **Smart Contract:** User calls `approve()` on USDC contract
3. **Database:** Payment authorization record created
4. **Backend:** Validates approval and calls `transferFrom()` to collect USDC
5. **Smart Contract:** Admin calls `mintTo()` to issue property tokens
6. **Database:** Transaction and holdings records updated

### **Yield Distribution Flow (Phase 2):**
1. **Treasury:** Deposits rental income USDC to YieldDistributor
2. **Admin:** Calls `distribute()` with yield amount per distribution round
3. **Token Holders:** Call `claimYield()` to withdraw their proportional share
4. **Database:** Distribution and claim records tracked

### **P2P Trading Flow (Phase 3):**
1. **Users:** Create buy/sell limit orders via OrderBookExchange
2. **Matching:** Orders matched automatically when price/size align
3. **Settlement:** Atomic token/USDC exchange with 0.5% protocol fees
4. **Database:** Order book activity and trade history logged

---

## 🛡️ **Security Features**

### **Access Control:**
- ✅ Only owner can mint tokens
- ✅ Minting disabled after completion
- ✅ ReentrancyGuard on all state-changing functions
- ✅ Constructor parameter validation

### **Data Integrity:**
- ✅ All parameters from Supabase (no hardcoded values)
- ✅ Immutable deployment configuration
- ✅ Funding deadline enforcement
- ✅ Supply cap enforcement

### **Audit Trail:**
- ✅ Comprehensive event logging
- ✅ Transaction hash tracking in database
- ✅ Block number and timestamp recording
- ✅ Gas usage monitoring

---

## 📊 **Gas Estimates**

**PropertyShareToken Deployment:** ~1,200,000 gas (~$12-50 on Base)
**Token Minting:** ~80,000 gas per `mintTo()` call
**ERC20 Transfers:** ~21,000 gas (standard)

---

## 🔮 **Next Phases**

### **Phase 2: YieldDistributor** 
- [ ] USDC yield deposit functions
- [ ] Snapshot-based token holder accounting
- [ ] Proportional yield calculation
- [ ] Claim mechanism with anti-double-spend
- [ ] Distribution round tracking

### **Phase 3: OrderBookExchange**
- [ ] Limit order creation and cancellation
- [ ] Order matching engine
- [ ] Protocol fee collection (0.5% buy + 0.5% sell)
- [ ] Atomic settlement mechanism
- [ ] Order book event indexing

---

## 📝 **Development Rules**

**Following OpenHouse Rules:**
- ✅ **Rule 4:** No mock data - all parameters from Supabase
- ✅ **Rule 3:** Secure access control with predefined wallets
- ✅ **Rule 6:** Comprehensive error handling and validation
- ✅ **Rule 7:** Minimal, targeted implementation
- ✅ **Rule 4:** Dynamic data only - contract reads from database

**Contract Standards:**
- ✅ OpenZeppelin-based for battle-tested security
- ✅ Solidity 0.8.24 with optimizer enabled
- ✅ Comprehensive NatSpec documentation
- ✅ Event-driven architecture for off-chain indexing

---

**Built for tokenized real estate investment on Base L2** 🏠⛓️ 