'use client'

import React, { useState } from 'react'
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

export function ConnectButton({ onAuthSuccess }: ConnectButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  const handleConnect = async (connector: Connector) => {
    try {
      setAuthError(null)
      connect({ connector })
    } catch {
      setAuthError('Failed to connect wallet')
    }
  }

  const handleAuthenticate = async () => {
    if (!address) return

    try {
      setIsAuthenticating(true)
      setAuthError(null)

      // fix: create SIWE message (Cursor Rule 5)
      const message = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to OpenHouse',
        uri: window.location.origin,
        version: '1',
        chainId: 8453, // Base mainnet
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
      console.error('Authentication error:', error)
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

  if (isConnected && address) {
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
              {connectors.map((connector) => (
                <Button
                  key={connector.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleConnect(connector)}
                  disabled={!connector.ready}
                >
                  {connector.name}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center p-4 bg-openhouse-bg-muted rounded-lg">
                <p className="text-sm text-openhouse-fg-muted mb-2">
                  Connected to {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="text-xs text-openhouse-fg-muted">
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
            <div className="p-3 bg-openhouse-danger/10 border border-openhouse-danger/20 rounded-lg">
              <p className="text-sm text-openhouse-danger">{authError}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 