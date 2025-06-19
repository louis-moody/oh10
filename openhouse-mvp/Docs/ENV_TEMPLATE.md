# OpenHouse Environment Variables

Copy this template to `.env.local` and fill in your actual values.  
**NEVER commit `.env.local` to Git.**

## Required Variables

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Authentication
APP_SESSION_JWT_SECRET=your_strong_jwt_secret_32_chars_minimum

# OnchainKit Configuration (Optional)
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key

# Base Network Configuration
NEXT_PUBLIC_BASE_CHAIN_ID=84532  # Base Sepolia testnet (8453 for mainnet)
NEXT_PUBLIC_BASE_RPC=https://sepolia.base.org

# USDC Token Configuration (Base Sepolia)
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7

# OpenHouse Wallet Configuration
NEXT_PUBLIC_TREASURY_ADDRESS=your_treasury_address
NEXT_PUBLIC_OPERATOR_ADDRESS=your_operator_address
NEXT_PUBLIC_DEPLOYER_ADDRESS=your_deployer_address
NEXT_PUBLIC_FALLBACK_ADDRESS=your_fallback_address

# Smart Contract Deployment Configuration
DEPLOYER_PRIVATE_KEY=0xf063a4c927727ac12d22d34fa324ca0b95507c06e623cb6d258aa941ea70376d
BASESCAN_API_KEY=your_basescan_api_key_for_verification
```

## Variable Descriptions

- **APP_SESSION_JWT_SECRET**: Strong secret (32+ chars) for signing JWTs
- **SUPABASE_SERVICE_ROLE_KEY**: Required for server-side database operations (bypasses RLS)
- **NEXT_PUBLIC_ONCHAINKIT_API_KEY**: Optional, for OnchainKit wallet abstraction features
- **NEXT_PUBLIC_BASE_CHAIN_ID**: 84532 for Base Sepolia testnet, 8453 for mainnet
- **NEXT_PUBLIC_BASE_RPC**: RPC endpoint for Base Sepolia
- **NEXT_PUBLIC_USDC_ADDRESS**: USDC test deployment on Base Sepolia
- **NEXT_PUBLIC_TREASURY_ADDRESS**: OpenHouse treasury wallet address for USDC approvals
- **NEXT_PUBLIC_OPERATOR_ADDRESS**: OpenHouse operator wallet address for contract operations
- **NEXT_PUBLIC_DEPLOYER_ADDRESS**: OpenHouse deployer wallet address for contract deployment
- **NEXT_PUBLIC_FALLBACK_ADDRESS**: OpenHouse fallback wallet address for emergency operations
- **DEPLOYER_PRIVATE_KEY**: Private key for contract deployment wallet (keep secure!)
- **BASESCAN_API_KEY**: API key for contract verification on BaseScan

## Wallet Configuration

OpenHouse uses OnchainKit for wallet connection and SIWE authentication with these connectors:
- **Injected wallets** (MetaMask, browser wallets)  
- **Coinbase Wallet** (with smart wallet preference)

WalletConnect is not used to avoid project ID complexity and maintain OnchainKit-first approach. 