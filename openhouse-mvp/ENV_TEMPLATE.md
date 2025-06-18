# OpenHouse Environment Variables

Copy this template to `.env.local` and fill in your actual values.  
**NEVER commit `.env.local` to Git.**

## Required Variables

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# JWT Authentication
APP_SESSION_JWT_SECRET=your_strong_random_string_32_chars_plus

# OnchainKit Configuration
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key_optional
NEXT_PUBLIC_ONCHAINKIT_PROJECT_ID=your_onchainkit_project_id

# WalletConnect Configuration
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Base Network Configuration
NEXT_PUBLIC_BASE_CHAIN_ID=84532  # Base Sepolia testnet
NEXT_PUBLIC_BASE_RPC=https://sepolia.base.org

# USDC Token Configuration (Base Sepolia)
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7
```

## Variable Descriptions

- **APP_SESSION_JWT_SECRET**: Strong secret (32+ chars) for signing JWTs
- **NEXT_PUBLIC_ONCHAINKIT_PROJECT_ID**: Required to initialize OnchainKit client
- **NEXT_PUBLIC_ONCHAINKIT_API_KEY**: Optional, for wallet abstraction features
- **NEXT_PUBLIC_BASE_CHAIN_ID**: 84532 for Base Sepolia testnet, 8453 for mainnet
- **NEXT_PUBLIC_BASE_RPC**: RPC endpoint for Base Sepolia
- **NEXT_PUBLIC_USDC_ADDRESS**: USDC test deployment on Base Sepolia 