# OpenHouse MVP - Tokenized Real Estate Investment Platform

OpenHouse is a tokenized real estate crowdfunding platform built on Base L2. Users invest in UK properties using USDC, with tokens representing ownership shares.

## 🚀 **Features**

### ✅ **Complete Authentication System**
- **Wallet Connection**: MetaMask, Coinbase Wallet, Trust Wallet support
- **SIWE Authentication**: Sign-in-with-Ethereum message verification
- **Profile Completion**: Automatic name/email capture with marketing consent
- **Session Management**: Secure JWT tokens in HttpOnly cookies

### 🏗️ **Architecture**
- **Frontend**: Next.js 15, React 19, TypeScript, ShadCN UI, Tailwind CSS
- **Blockchain**: Base L2 (Sepolia testnet), Wagmi, OnchainKit
- **Backend**: Supabase PostgreSQL, Row Level Security
- **Authentication**: SIWE + JWT sessions

### 🎯 **User Flow**
1. **Connect Wallet** → Choose from supported wallets
2. **Sign Message** → SIWE authentication 
3. **Complete Profile** → Name, email, marketing consent (one-time)
4. **Access Platform** → Full authentication complete

## 🛠️ **Setup**

### 1. Environment Variables
Copy `ENV_TEMPLATE.md` to `.env.local` and fill in your values:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Authentication
APP_SESSION_JWT_SECRET=your_strong_jwt_secret_32_chars_minimum

# Base Network Configuration
NEXT_PUBLIC_BASE_CHAIN_ID=84532  # Base Sepolia testnet
NEXT_PUBLIC_BASE_RPC=https://sepolia.base.org
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7
```

### 2. Database Setup
Run the migration in your Supabase SQL Editor:

```sql
-- Copy and run profile-completion-migration.sql
```

### 3. Install & Run
```bash
npm install
npm run dev
```

## 📁 **Project Structure**

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── app-login/         # SIWE authentication
│   │   ├── app-logout/        # Session cleanup
│   │   ├── profile-complete/  # Profile completion
│   │   └── user-profile/      # Profile fetching
│   ├── components/            # React components
│   │   ├── ui/               # ShadCN UI components
│   │   ├── AuthenticationFlow.tsx  # Complete auth flow
│   │   ├── ConnectButton.tsx      # Wallet connection
│   │   ├── ProfileCompleteModal.tsx # Profile capture
│   │   └── ...
│   ├── properties/[id]/       # Property detail pages
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx             # Homepage
├── lib/
│   ├── jwt.ts               # JWT utilities
│   ├── supabase.ts          # Database client
│   ├── utils.ts             # Utilities
│   └── wagmi-config.ts      # Wallet configuration
└── middleware.ts            # Route protection
```

## 🔒 **Security Features**

- **HttpOnly Cookies**: JWT tokens never exposed to frontend JS
- **SIWE Verification**: Cryptographic proof of wallet ownership  
- **Session Validation**: Middleware protection for routes
- **Input Validation**: Comprehensive form and API validation
- **RLS Ready**: Supabase Row Level Security policies prepared

## 🎨 **Design System**

- **ShadCN UI**: Customized components with OpenHouse branding
- **Tailwind CSS**: Custom design tokens and color system
- **Responsive**: Mobile-first design approach
- **Accessibility**: WCAG compliant components

## 📊 **Database Schema**

### Users Table
- `id`, `wallet_address`, `name`, `email`
- `profile_completed`, `marketing_consent`
- `created_at`, `updated_at`

### Active Sessions
- `id`, `user_id`, `jwt_id`, `wallet_address`
- `expires_at`, `revoked`, `created_at`

### Properties, Transactions, Holdings
- Full schema for real estate investment tracking

## 🚀 **Ready for Production**

The MVP foundation is complete with:
- ✅ Secure wallet authentication
- ✅ User profile management  
- ✅ Session handling
- ✅ Database architecture
- ✅ Component system

**Next Phase**: Property investment flows, USDC payments, token minting

---

Built with ❤️ for tokenized real estate investment
