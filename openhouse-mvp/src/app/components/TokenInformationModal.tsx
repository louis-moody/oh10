'use client'

import React from 'react'
import { ExternalLink, Copy, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { useChainId } from 'wagmi'
import Image from 'next/image'

interface TokenInformationModalProps {
  isOpen: boolean
  onClose: () => void
  property: {
    id: string
    name: string
    status: string
    total_shares: number
    price_per_token: number
    token_contract_address?: string
  }
  tokenDetails?: {
    token_name: string
    token_symbol: string
    total_supply: number
    contract_address: string
  }
}

export function TokenInformationModal({ 
  isOpen, 
  onClose, 
  property,
  tokenDetails
}: TokenInformationModalProps) {
  const chainId = useChainId()

  // fix: get block explorer URL based on chain (Cursor Rule 4)
  const getExplorerUrl = (address: string) => {
    const baseUrl = chainId === 8453 
      ? 'https://basescan.org' 
      : 'https://sepolia.basescan.org'
    return `${baseUrl}/address/${address}`
  }

  // fix: copy to clipboard functionality (Cursor Rule 4)
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  const contractAddress = tokenDetails?.contract_address || property.token_contract_address

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image src="/crypto/usdc.svg" alt="USDC" width={20} height={20} />
            Token Information
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-0">
          {/* Property Info */}
          <Card className="p-0">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Property</span>
                  <span className="font-medium text-openhouse-fg">{property.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Property ID</span>
                  <span className="font-medium text-openhouse-fg font-mono">{property.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Status</span>
                  <Badge variant="outline" className="text-xs">
                    {property.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Details */}
          {tokenDetails && (
            <Card className="p-0">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-openhouse-fg-muted">Token Name</span>
                    <span className="font-medium text-openhouse-fg">{tokenDetails.token_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-openhouse-fg-muted">Token Symbol</span>
                    <span className="font-medium text-openhouse-fg font-mono">{tokenDetails.token_symbol}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-openhouse-fg-muted">Total Supply</span>
                    <span className="font-medium text-openhouse-fg">{tokenDetails.total_supply.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contract Address */}
          {contractAddress && (
            <Card className="p-0">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-openhouse-fg-muted">Token Contract Address</span>
                    <div className="mt-1 p-2 bg-openhouse-bg-muted rounded border text-sm font-mono break-all">
                      {contractAddress}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(contractAddress)}
                        className="flex-1"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(getExplorerUrl(contractAddress), '_blank')}
                        className="flex-1"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        BaseScan
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trading Info */}
          <Card className="p-0">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Network</span>
                  <span className="font-medium text-openhouse-fg">
                    {chainId === 8453 ? 'Base Mainnet' : 'Base Sepolia'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Trading Status</span>
                  <Badge variant="outline" className="text-xs bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20">
                    Live Trading
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
} 