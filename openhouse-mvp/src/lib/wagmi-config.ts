import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, walletConnect, injected } from 'wagmi/connectors'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

export const config = createConfig({
  chains: [base],
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
    [base.id]: http()
  }
}) 