'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/app/components/ui'
import { Input } from '@/app/components/ui'
import { LoadingState } from '@/app/components'
import { AlertCircle, DollarSign, TrendingDown, CheckCircle, Settings, Shield } from 'lucide-react'

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
  liquidity_pool_usdc?: number
  daily_limit_usdc?: number
  transaction_limit_usdc?: number
}

// fix: enhanced admin modal for configurable fallback liquidity (Cursor Rule 4)
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
  
  // fix: manual configuration state (Cursor Rule 4)
  const [liquidityPoolUsdc, setLiquidityPoolUsdc] = useState<number>(0)
  const [dailyLimitUsdc, setDailyLimitUsdc] = useState<number>(10000)
  const [transactionLimitUsdc, setTransactionLimitUsdc] = useState<number>(1000)
  const [customDiscountPercent, setCustomDiscountPercent] = useState<number>(2)

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

      // fix: populate manual configuration fields (Cursor Rule 4)
      if (data.liquidity_pool_usdc) setLiquidityPoolUsdc(data.liquidity_pool_usdc)
      if (data.daily_limit_usdc) setDailyLimitUsdc(data.daily_limit_usdc)
      if (data.transaction_limit_usdc) setTransactionLimitUsdc(data.transaction_limit_usdc)

    } catch (error) {
      console.error('Error fetching fallback status:', error)
      setError(error instanceof Error ? error.message : 'Failed to load fallback status')
    } finally {
      setIsLoading(false)
    }
  }

  // fix: enable fallback liquidity with manual configuration (Cursor Rule 4)
  const handleEnableFallback = async () => {
    if (!fallbackStatus) return

    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      // Calculate fallback buy price with custom discount
      const customFallbackPrice = fallbackStatus.current_status.current_price_usdc * (1 - customDiscountPercent / 100)

      const response = await fetch('/api/admin/fallback-liquidity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property.id,
          action: 'enable',
          fallback_buy_price: customFallbackPrice,
          liquidity_pool_usdc: liquidityPoolUsdc,
          daily_limit_usdc: dailyLimitUsdc,
          transaction_limit_usdc: transactionLimitUsdc,
          discount_percent: customDiscountPercent
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to enable fallback liquidity')
      }

      setSuccess(`Fallback liquidity enabled! Pool: $${liquidityPoolUsdc.toLocaleString()}, Daily limit: $${dailyLimitUsdc.toLocaleString()}`)
      
      // Refresh status
      await fetchFallbackStatus()

      // Notify parent
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 3000)

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

  // Calculate suggested liquidity pool (10% of property value)
  const suggestedLiquidityPool = Math.round(property.funding_goal_usdc * 0.1)

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Fallback Liquidity Configuration - {property.name}
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

            {/* Manual Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Liquidity Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Liquidity Pool (USDC)</label>
                    <Input
                      type="number"
                      value={liquidityPoolUsdc}
                      onChange={(e) => setLiquidityPoolUsdc(Number(e.target.value))}
                      placeholder={`Suggested: ${suggestedLiquidityPool.toLocaleString()}`}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Total USDC available for buying tokens from users
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Discount %</label>
                    <Input
                      type="number"
                      value={customDiscountPercent}
                      onChange={(e) => setCustomDiscountPercent(Number(e.target.value))}
                      min="1"
                      max="10"
                      step="0.5"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Discount below market price (1-10%)
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Daily Limit (USDC)</label>
                    <Input
                      type="number"
                      value={dailyLimitUsdc}
                      onChange={(e) => setDailyLimitUsdc(Number(e.target.value))}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum USDC that can be traded per day
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Transaction Limit (USDC)</label>
                    <Input
                      type="number"
                      value={transactionLimitUsdc}
                      onChange={(e) => setTransactionLimitUsdc(Number(e.target.value))}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum USDC per single transaction
                    </p>
                  </div>
                </div>

                {/* Live Calculation */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800">Live Calculation:</p>
                  <p className="text-sm text-blue-700">
                    Fallback buy price: <span className="font-semibold">
                      {formatCurrency(fallbackStatus.current_status.current_price_usdc * (1 - customDiscountPercent / 100))}
                    </span> ({customDiscountPercent}% discount)
                  </p>
                  <p className="text-sm text-blue-700">
                    Example: User sells $1,000 → receives <span className="font-semibold">
                      {formatCurrency(1000 * (1 - customDiscountPercent / 100))}
                    </span>
                  </p>
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
                    disabled={isLoading || liquidityPoolUsdc <= 0}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isLoading ? 'Enabling...' : `Enable Fallback Liquidity (${formatCurrency(liquidityPoolUsdc)} pool)`}
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
                
                <div className="text-xs text-gray-500 space-y-1">
                  <p><strong>Enable:</strong> Users can sell tokens to OpenHouse at discounted prices</p>
                  <p><strong>Disable:</strong> Users can only trade via orderbook (if available)</p>
                  <p><strong>Pool Size:</strong> Determines how much liquidity OpenHouse provides</p>
                </div>
              </CardContent>
            </Card>

            {/* Fallback Wallet Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Fallback Wallet & Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">USDC payments will come from:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block">
                  {fallbackStatus.fallback_wallet}
                </code>
                <div className="mt-3 text-xs text-gray-500 space-y-1">
                  <p><strong>Requirements:</strong></p>
                  <p>• Wallet must have sufficient USDC balance (≥ liquidity pool size)</p>
                  <p>• Private key must be configured in FALLBACK_PRIVATE_KEY</p>
                  <p>• All transactions are recorded on-chain with real tx hashes</p>
                  <p>• Only admin wallets can enable/disable this feature</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 