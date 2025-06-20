'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui'
import { Button } from '@/app/components/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui'
import { Badge } from '@/app/components/ui'
import { LoadingState } from '@/app/components'
import { AlertCircle, DollarSign, TrendingDown, CheckCircle } from 'lucide-react'

interface PropertyWithFunding {
  id: string
  name: string
  funding_goal_usdc: number
  status: string
  raised_amount: number 
  progress_percentage: number
  token_contract_address?: string
  payment_count: number
}

interface FallbackLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  property: PropertyWithFunding
  onSuccess: () => void
}

interface FallbackStatus {
  current_status: {
    fallback_enabled: boolean
    liquidity_enabled: boolean
    current_price_usdc: number
  }
  fallback_wallet: string
  fallback_buy_price: number
  discount_percentage: string
}

// fix: admin modal for enabling fallback liquidity (Cursor Rule 4)
export function FallbackLiquidityModal({ 
  isOpen, 
  onClose, 
  property,
  onSuccess
}: FallbackLiquidityModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fallbackStatus, setFallbackStatus] = useState<FallbackStatus | null>(null)

  // Load fallback status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchFallbackStatus()
    }
  }, [isOpen, property.id])

  // fix: fetch current fallback liquidity status (Cursor Rule 4)
  const fetchFallbackStatus = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/admin/fallback-liquidity?property_id=${property.id}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch fallback status')
      }

      const data = await response.json()
      setFallbackStatus(data)

    } catch (error) {
      console.error('Error fetching fallback status:', error)
      setError(error instanceof Error ? error.message : 'Failed to load fallback status')
    } finally {
      setIsLoading(false)
    }
  }

  // fix: enable fallback liquidity for property (Cursor Rule 4)
  const handleEnableFallback = async () => {
    if (!fallbackStatus) return

    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/admin/fallback-liquidity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property.id,
          action: 'enable',
          fallback_buy_price: fallbackStatus.fallback_buy_price
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to enable fallback liquidity')
      }

      setSuccess('Fallback liquidity enabled! Users can now sell to OpenHouse at guaranteed prices.')
      
      // Refresh status
      await fetchFallbackStatus()

      // Notify parent
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 2000)

    } catch (error) {
      console.error('Error enabling fallback liquidity:', error)
      setError(error instanceof Error ? error.message : 'Failed to enable fallback liquidity')
    } finally {
      setIsLoading(false)
    }
  }

  // fix: disable fallback liquidity for property (Cursor Rule 4)
  const handleDisableFallback = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/admin/fallback-liquidity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property.id,
          action: 'disable'
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to disable fallback liquidity')
      }

      setSuccess('Fallback liquidity disabled.')
      
      // Refresh status
      await fetchFallbackStatus()

    } catch (error) {
      console.error('Error disabling fallback liquidity:', error)
      setError(error instanceof Error ? error.message : 'Failed to disable fallback liquidity')
    } finally {
      setIsLoading(false)
    }
  }

  // fix: utility functions (Cursor Rule 4)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(amount)
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fallback Liquidity - {property.name}
          </DialogTitle>
        </DialogHeader>

        {isLoading && !fallbackStatus && (
          <div className="py-8">
            <LoadingState />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {fallbackStatus && (
          <div className="space-y-6">
            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Current Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Fallback Enabled</p>
                    <Badge variant={fallbackStatus.current_status.fallback_enabled ? "default" : "secondary"}>
                      {fallbackStatus.current_status.fallback_enabled ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Liquidity Active</p>
                    <Badge variant={fallbackStatus.current_status.liquidity_enabled ? "default" : "secondary"}>
                      {fallbackStatus.current_status.liquidity_enabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Current Token Price</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(fallbackStatus.current_status.current_price_usdc)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Fallback Pricing (2% Discount)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Fallback Buy Price</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {formatCurrency(fallbackStatus.fallback_buy_price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Discount</p>
                    <Badge variant="secondary">
                      {fallbackStatus.discount_percentage}
                    </Badge>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <p>When users sell tokens, OpenHouse will buy them at the fallback price using the fallback wallet.</p>
                  <p className="mt-2 font-medium">This provides guaranteed liquidity for all token holders.</p>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!fallbackStatus.current_status.liquidity_enabled ? (
                  <Button
                    onClick={handleEnableFallback}
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? 'Enabling...' : 'Enable Fallback Liquidity'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleDisableFallback}
                    disabled={isLoading}
                    variant="outline"
                    className="w-full border-red-600 text-red-600 hover:bg-red-50"
                  >
                    {isLoading ? 'Disabling...' : 'Disable Fallback Liquidity'}
                  </Button>
                )}
                
                <div className="text-xs text-gray-500">
                  <p><strong>Enable:</strong> Users can sell tokens to OpenHouse at {formatCurrency(fallbackStatus.fallback_buy_price)} each</p>
                  <p><strong>Disable:</strong> Users can only trade via orderbook (if available)</p>
                </div>
              </CardContent>
            </Card>

            {/* Fallback Wallet Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Fallback Wallet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">USDC payments will come from:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block">
                  {fallbackStatus.fallback_wallet}
                </code>
                <p className="text-xs text-gray-500 mt-2">
                  This wallet must have sufficient USDC balance to purchase tokens from sellers.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 