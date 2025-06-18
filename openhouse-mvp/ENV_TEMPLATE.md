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
```

## Variable Descriptions

- **APP_SESSION_JWT_SECRET**: Strong secret (32+ chars) for signing JWTs
- **SUPABASE_SERVICE_ROLE_KEY**: Required for server-side database operations (bypasses RLS)
- **NEXT_PUBLIC_ONCHAINKIT_API_KEY**: Optional, for OnchainKit wallet abstraction features
- **NEXT_PUBLIC_BASE_CHAIN_ID**: 84532 for Base Sepolia testnet, 8453 for mainnet
- **NEXT_PUBLIC_BASE_RPC**: RPC endpoint for Base Sepolia
- **NEXT_PUBLIC_USDC_ADDRESS**: USDC test deployment on Base Sepolia

## Wallet Configuration

OpenHouse uses OnchainKit for wallet connection and SIWE authentication with these connectors:
- **Injected wallets** (MetaMask, browser wallets)  
- **Coinbase Wallet** (with smart wallet preference)

WalletConnect is not used to avoid project ID complexity and maintain OnchainKit-first approach. 