import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, injected, metaMask } from 'wagmi/connectors'

// fix: use consistent RPC URL environment variable (Cursor Rule 6)
const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org'

// fix: Support MetaMask, Trust Wallet, and Coinbase Wallet with proper detection (Cursor Rule 2)
export const config = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    // fix: MetaMask-specific connector for better detection (Cursor Rule 4)
    metaMask({
      dappMetadata: {
        name: 'OpenHouse',
        url: 'https://openhouse.com',
        iconUrl: 'https://framerusercontent.com/images/oyE24xB8znyNiw81BGD9SRiFs.png',
      },
    }),
    // fix: Generic injected connector for Trust Wallet and others (Cursor Rule 4)
    injected({
      shimDisconnect: true,
    }),
    // fix: Coinbase Wallet connector (Cursor Rule 4)
    coinbaseWallet({
      appName: 'OpenHouse',
      appLogoUrl: 'https://framerusercontent.com/images/oyE24xB8znyNiw81BGD9SRiFs.png',
      preference: 'all',
      version: '4',
      headlessMode: false,
    }),
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
    [base.id]: http(),
  },
}) 