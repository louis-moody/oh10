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
} from './ui/dialog'
import { Wallet, LogOut } from 'lucide-react'
import type { Connector } from 'wagmi'
import { Badge } from './ui/badge'

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
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([])
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  const { address, isConnected, connector } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  // fix: prevent hydration mismatch (Cursor Rule 6)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // fix: detect available wallets when component mounts (Cursor Rule 4)
  useEffect(() => {
    if (!isMounted) return // Prevent SSR mismatch
    
    const detectWallets = () => {
      // fix: safely access window.ethereum with proper typing (Cursor Rule 6)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethereum = (window as any).ethereum
      
      // fix: improved wallet detection (Cursor Rule 4)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasMetaMask = !!ethereum?.isMetaMask || !!(ethereum?.providers?.find((p: any) => p.isMetaMask))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasTrust = !!ethereum?.isTrust || !!(ethereum?.providers?.find((p: any) => p.isTrust))
      const hasInjected = !!ethereum

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
      
      // fix: show available wallets even if connector not found (Cursor Rule 4)
      const filteredOptions = options.filter(option => {
        if (option.id === 'coinbaseWallet') return true // Always show Coinbase
        return option.isAvailable
      })

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

      connect({ connector })
    } catch (error) {
      setAuthError(`Failed to connect ${walletOption.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleAuthenticate = async () => {
    if (!address) return

    try {
      setIsAuthenticating(true)
      setAuthError(null)

      // fix: create SIWE message (Cursor Rule 5)
      const isDevelopment = process.env.NODE_ENV === 'development'
      const chainId = isDevelopment ? 84532 : 8453 // Base Sepolia for dev, Base mainnet for prod
      
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
      
      // fix: sign message with wallet (Cursor Rule 5)
      const signature = await signMessageAsync({
        message: messageString
      })

      // fix: send to authentication endpoint (Cursor Rule 5)
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

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Authentication failed')
      }

      // fix: success callback and close modal (Cursor Rule 7)
      setIsModalOpen(false)
      onAuthSuccess?.(result.wallet_address)

    } catch (error) {
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
    } catch {
      // fix: still disconnect wallet even if API fails (Cursor Rule 6)
      disconnect()
    }
  }

  // fix: prevent hydration mismatch by not rendering until mounted (Cursor Rule 6)
  if (!isMounted) {
    return (
      <Button variant="outline" disabled>
        <Wallet className="w-4 h-4 mr-2" />
        Loading...
      </Button>
    )
  }

  // fix: show disconnect button when connected (Cursor Rule 7)
  if (isConnected && address && !isModalOpen) {
    return (
      <Button 
        onClick={handleDisconnect}
        variant="outline"
        className="flex items-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        Disconnect
      </Button>
    )
  }

  return (
    <>
      <Button 
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2"
      >
        Connect Wallet
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
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
            {/* Wallet connection phase */}
            {!isConnected && (
              <div className="space-y-3">
                <p className="text-sm text-openhouse-fg-muted">
                  Choose your wallet to connect to OpenHouse
                </p>
                
                {walletOptions.map((option) => (
                  <Button
                    key={option.id}
                    variant="outline"
                    className="w-full justify-start h-12"
                    onClick={() => handleConnect(option)}
                    disabled={!option.isAvailable}
                  >
                    <Wallet className="w-5 h-5 mr-3" />
                    <span>{option.name}</span>
                    {!option.isAvailable && (
                      <Badge variant="secondary" className="ml-auto">
                        Not Available
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            )}

            {/* Authentication phase */}
            {isConnected && address && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-openhouse-fg-muted mb-2">
                    Connected to {connector?.name}
                  </p>
                  <Badge variant="outline" className="px-3 py-1">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-openhouse-fg-muted">
                    Sign a message to authenticate your wallet with OpenHouse
                  </p>
                  
                  <Button
                    onClick={handleAuthenticate}
                    disabled={isAuthenticating}
                    className="w-full"
                  >
                    {isAuthenticating ? 'Signing...' : 'Sign Message'}
                  </Button>
                </div>
              </div>
            )}

            {/* Error display */}
            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{authError}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 