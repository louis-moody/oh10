'use client'

import React, { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { SiweMessage } from 'siwe'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Wallet, LogOut, Loader2 } from 'lucide-react'
import type { Connector } from 'wagmi'

interface ConnectButtonProps {
  onAuthSuccess?: (walletAddress: string) => void
}

// fix: define specific wallet options as per PRD requirements (Cursor Rule 4)
interface WalletOption {
  name: string
  id: string
  icon?: string
  isAvailable: boolean
  connector?: Connector
}

export function ConnectButton({ onAuthSuccess }: ConnectButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([])
  const [isMounted, setIsMounted] = useState(false)

  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  // fix: ensure client-side only execution to prevent hydration mismatch (Cursor Rule 6)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // fix: detect specific wallets as per PRD requirements (Cursor Rule 4)
  useEffect(() => {
    if (!isMounted) return // Prevent SSR mismatch
    
    const detectWallets = () => {
      // fix: safely access window.ethereum with proper typing (Cursor Rule 6)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethereum = (window as any).ethereum
      
      // fix: debug connector information (Cursor Rule 6)
      console.log('Available connectors:', connectors.map(c => ({ id: c.id, name: c.name, ready: c.ready })))
      console.log('Window ethereum:', ethereum)
      
      // fix: improved wallet detection (Cursor Rule 4)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasMetaMask = !!ethereum?.isMetaMask || !!(ethereum?.providers?.find((p: any) => p.isMetaMask))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasTrust = !!ethereum?.isTrust || !!(ethereum?.providers?.find((p: any) => p.isTrust))
      const hasInjected = !!ethereum
      
      console.log('MetaMask detected:', hasMetaMask)
      console.log('Trust detected:', hasTrust)
      console.log('Injected detected:', hasInjected)

      const options: WalletOption[] = [
        {
          name: 'MetaMask',
          id: 'metamask',
          isAvailable: hasMetaMask,
          connector: connectors.find(c => c.id === 'metaMask' || c.id === 'metaMaskSDK')
        },
        {
          name: 'Trust Wallet',
          id: 'trustWallet',
          isAvailable: hasTrust,
          connector: connectors.find(c => c.id === 'injected')
        },
        {
          name: 'Coinbase Wallet',
          id: 'coinbaseWallet',
          isAvailable: true, // Always available
          connector: connectors.find(c => c.id === 'coinbaseWalletSDK' || c.id === 'coinbaseWallet' || c.name?.includes('Coinbase'))
        },
        {
          name: 'Connect Wallet',
          id: 'generic',
          isAvailable: hasInjected && !hasMetaMask && !hasTrust,
          connector: connectors.find(c => c.id === 'injected')
        }
      ]

      // fix: debug filtered options with connector details (Cursor Rule 6)
      console.log('Wallet options before filter:', options.map(o => ({ 
        name: o.name, 
        isAvailable: o.isAvailable, 
        connectorId: o.connector?.id,
        connectorName: o.connector?.name 
      })))
      
      // fix: show available wallets even if connector not found (Cursor Rule 4)
      const filteredOptions = options.filter(option => {
        if (option.id === 'coinbaseWallet') return true // Always show Coinbase
        return option.isAvailable
      })
      
      console.log('Wallet options after filter:', filteredOptions.map(o => ({ 
        name: o.name, 
        connectorId: o.connector?.id,
        connectorName: o.connector?.name 
      })))

      setWalletOptions(filteredOptions)
    }

    detectWallets()
  }, [connectors, isMounted])

  const handleConnect = async (walletOption: WalletOption) => {
    try {
      setAuthError(null)
      
      // fix: fallback to injected connector if specific connector not found (Cursor Rule 4)
      let connector = walletOption.connector
      if (!connector) {
        // fix: try to find appropriate connector as fallback (Cursor Rule 6)
        if (walletOption.id === 'metamask') {
          connector = connectors.find(c => c.id === 'metaMask') || connectors.find(c => c.id === 'injected')
        } else if (walletOption.id === 'trustWallet') {
          connector = connectors.find(c => c.id === 'injected')
        } else if (walletOption.id === 'coinbaseWallet') {
          connector = connectors.find(c => c.id === 'coinbaseWalletSDK' || c.name?.includes('Coinbase'))
        } else {
          connector = connectors.find(c => c.id === 'injected')
        }
      }
      
      if (!connector) {
        throw new Error(`No connector found for ${walletOption.name}. Please make sure the wallet is installed.`)
      }

      // fix: debug connection attempt (Cursor Rule 6)
      console.log('Attempting to connect with:', walletOption.name, connector.id)
      connect({ connector })
    } catch (error) {
      // fix: better error logging (Cursor Rule 6)
      console.error('Connection error:', error)
      setAuthError(`Failed to connect ${walletOption.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleAuthenticate = async () => {
    if (!address) return

    try {
      setIsAuthenticating(true)
      setAuthError(null)
      console.log('🔐 Starting authentication for address:', address)

      // fix: create SIWE message (Cursor Rule 5)
      const isDevelopment = process.env.NODE_ENV === 'development'
      const chainId = isDevelopment ? 84532 : 8453 // Base Sepolia for dev, Base mainnet for prod
      console.log('🌐 Using chainId:', chainId, isDevelopment ? '(Base Sepolia)' : '(Base Mainnet)')
      
      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to OpenHouse',
        uri: window.location.origin,
        version: '1',
        chainId: chainId,
        nonce: Math.random().toString(36).substring(2, 15),
        issuedAt: new Date().toISOString()
      })

      const messageString = message.prepareMessage()
      console.log('📝 SIWE message created:', {
        domain: message.domain,
        address: message.address,
        chainId: message.chainId,
        messageLength: messageString.length
      })
      
      // fix: sign message with wallet (Cursor Rule 5)
      console.log('✍️ Requesting signature from wallet...')
      const signature = await signMessageAsync({
        message: messageString
      })
      console.log('✅ Message signed successfully, signature length:', signature.length)

      // fix: send to authentication endpoint (Cursor Rule 5)
      console.log('📡 Sending authentication request to /api/app-login...')
      const response = await fetch('/api/app-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageString,
          signature: signature
        })
      })

      console.log('📡 API response status:', response.status)
      const result = await response.json()
      console.log('📡 API response data:', result)

      if (!response.ok) {
        throw new Error(result.error || 'Authentication failed')
      }

      // fix: success callback and close modal (Cursor Rule 7)
      console.log('🎉 Authentication successful!')
      setIsModalOpen(false)
      onAuthSuccess?.(result.wallet_address)

    } catch (error) {
      console.error('💥 Authentication error:', error)
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      // fix: logout API call to clear session (Cursor Rule 3)
      await fetch('/api/app-logout', {
        method: 'POST'
      })

      disconnect()
      onAuthSuccess?.('')
    } catch (error) {
      console.error('Logout error:', error)
      // fix: still disconnect wallet even if API fails (Cursor Rule 6)
      disconnect()
    }
  }

  // fix: prevent hydration mismatch by not rendering until mounted (Cursor Rule 6)
  if (!isMounted) {
    return (
      <Button variant="default" className="gap-2" disabled>
        <Wallet className="w-4 h-4" />
        Loading...
      </Button>
    )
  }

  // fix: show disconnect button only when both connected AND authenticated (Cursor Rule 7)
  // We know user is authenticated if they've completed the flow successfully
  if (isConnected && address && !isModalOpen) {
    // Only show disconnect button if modal is closed (meaning auth completed)
    return (
      <Button
        variant="outline"
        onClick={handleDisconnect}
        className="gap-2"
      >
        <LogOut className="w-4 h-4" />
        {`${address.slice(0, 6)}...${address.slice(-4)}`}
      </Button>
    )
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Connect Wallet
          </DialogTitle>
          <DialogDescription>
            Choose a wallet to connect to OpenHouse
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isConnected ? (
            <div className="space-y-2">
              {walletOptions.map((walletOption) => (
                <Button
                  key={walletOption.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleConnect(walletOption)}
                  disabled={!walletOption.isAvailable && walletOption.id !== 'coinbaseWallet'}
                >
                  {walletOption.name}
                  {!walletOption.isAvailable && walletOption.id !== 'coinbaseWallet' && (
                    <span className="ml-auto text-xs text-muted-foreground">Not installed</span>
                  )}
                </Button>
              ))}
              {walletOptions.length === 0 && (
                <div className="text-center p-4 text-sm text-muted-foreground">
                  No supported wallets detected. Please install MetaMask, Coinbase Wallet, or Trust Wallet.
                </div>
              )}
              <div className="text-xs text-center text-muted-foreground mt-2">
                Install wallet extensions to see more options
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Connected to {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sign a message to authenticate
                </p>
              </div>
              
              <Button
                onClick={handleAuthenticate}
                disabled={isAuthenticating}
                className="w-full"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign Message'
                )}
              </Button>
            </div>
          )}

          {authError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{authError}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 