import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, injected } from 'wagmi/connectors'

const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC

// fix: Full DeFi approach - support ALL wallets without forcing Coinbase accounts (Cursor Rule 2)
export const config = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    coinbaseWallet({
      appName: 'OpenHouse',
      appLogoUrl: 'https://framerusercontent.com/images/oyE24xB8znyNiw81BGD9SRiFs.png',
      preference: 'all', // Support ALL wallet types - DeFi first!
      version: '4',
      headlessMode: false, // Show Coinbase UI for smart wallet creation
    }),
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
    [base.id]: http(),
  },
}) 