import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, walletConnect, injected } from 'wagmi/connectors'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''
const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC

export const config = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: 'OpenHouse',
      appLogoUrl: 'https://openhouse.com/logo.png'
    }),
    walletConnect({
      projectId,
      metadata: {
        name: 'OpenHouse',
        description: 'Tokenized real estate investment on Base L2',
        url: 'https://openhouse.com',
        icons: ['https://openhouse.com/logo.png']
      }
    })
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
    [base.id]: http()
  }
}) 