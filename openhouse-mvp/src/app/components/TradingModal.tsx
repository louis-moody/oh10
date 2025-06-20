'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Calculator, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent } from './ui/card'

import { type Property } from '@/lib/supabase'
import { OrderBookExchangeABI, PROPERTY_SHARE_TOKEN_ABI, getUserUsdcInfo } from '@/lib/contracts'
import { useChainId } from 'wagmi'

interface TradingModalProps {
  isOpen: boolean
  onClose: () => void
  property: Property & {
    token_contract_address?: string
    orderbook_contract_address?: string
  }
  onTradeSuccess: () => void
}

type TradeType = 'buy' | 'sell'
type FlowState = 'input' | 'confirming' | 'success' | 'error'

export function TradingModal({ 
  isOpen, 
  onClose, 
  property,
  onTradeSuccess
}: TradingModalProps) {
  const [activeTab, setActiveTab] = useState<TradeType>('buy')
  const [tokenAmount, setTokenAmount] = useState('')
  const [pricePerToken, setPricePerToken] = useState('')
  const [flowState, setFlowState] = useState<FlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userTokenBalance, setUserTokenBalance] = useState<bigint>(BigInt(0))
  const [estimatedCost, setEstimatedCost] = useState<number>(0)
  const [marketData, setMarketData] = useState({
    lastPrice: 0,
    buyPrice: 0,
    sellPrice: 0
  })

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // fix: fetch user token balance from PropertyShareToken (Cursor Rule 4)
  const { data: tokenBalance } = useReadContract({
    address: property.token_contract_address as `0x${string}`,
    abi: PROPERTY_SHARE_TOKEN_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!property.token_contract_address
    }
  })

  // fix: fetch market data from OrderBook exchange (Cursor Rule 4)
  const fetchMarketData = useCallback(async () => {
    if (!property.orderbook_contract_address) return

    try {
      // TODO: Implement market data fetching from OrderBook contract
      // This would involve fetching recent orders and calculating current market prices
      setMarketData({
        lastPrice: property.price_per_token,
        buyPrice: property.price_per_token * 1.01, // 1% spread example
        sellPrice: property.price_per_token * 0.99
      })
    } catch (error) {
      console.error('Failed to fetch market data:', error)
    }
  }, [property.orderbook_contract_address, property.price_per_token])

  // fix: fetch user balances and market data when modal opens (Cursor Rule 4)
  useEffect(() => {
    if (isOpen && isConnected && address) {
      fetchUserUsdcInfo()
      fetchMarketData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isConnected, address])

  // fix: update user token balance when data changes (Cursor Rule 4)
  useEffect(() => {
    if (tokenBalance) {
      setUserTokenBalance(tokenBalance as bigint)
    }
  }, [tokenBalance])

  // fix: fetch user USDC balance (Cursor Rule 4)
  const fetchUserUsdcInfo = useCallback(async () => {
    if (!address || !isConnected || !property.orderbook_contract_address) return

    try {
      const usdcInfo = await getUserUsdcInfo(chainId, address, property.orderbook_contract_address as `0x${string}`)
      if (usdcInfo) {
        setUserUsdcBalance(usdcInfo.balance)
      }
    } catch (error) {
      console.error('Failed to fetch USDC info:', error)
    }
  }, [address, isConnected, chainId, property.orderbook_contract_address])

  // fix: calculate estimated cost/return based on inputs (Cursor Rule 4)
  useEffect(() => {
    if (tokenAmount && pricePerToken) {
      const tokens = parseFloat(tokenAmount)
      const price = parseFloat(pricePerToken)
      const cost = tokens * price
      
      // Add 0.5% protocol fee for both buy and sell
      const feeAmount = cost * 0.005
      const totalCost = activeTab === 'buy' ? cost + feeAmount : cost - feeAmount
      
      setEstimatedCost(totalCost)
    } else {
      setEstimatedCost(0)
    }
  }, [tokenAmount, pricePerToken, activeTab])

  // fix: reset form when switching tabs (Cursor Rule 4)
  useEffect(() => {
    setTokenAmount('')
    setPricePerToken('')
    setError(null)
    setFlowState('input')
  }, [activeTab])

  // fix: reset modal state when opened (Cursor Rule 4)
  useEffect(() => {
    if (isOpen) {
      setActiveTab('buy')
      setTokenAmount('')
      setPricePerToken('')
      setFlowState('input')
      setError(null)
      // Set default price to current market price
      setPricePerToken(property.price_per_token.toString())
    }
  }, [isOpen, property.price_per_token])

  // fix: handle successful transaction (Cursor Rule 4)
  useEffect(() => {
    if (isConfirmed && hash && flowState === 'confirming') {
      setFlowState('success')
      // Refresh data after successful trade
      setTimeout(() => {
        onTradeSuccess()
        onClose()
      }, 2000)
    }
  }, [isConfirmed, hash, flowState, onTradeSuccess, onClose])

  // fix: update flow state based on transaction status (Cursor Rule 4)
  useEffect(() => {
    if (isPending && flowState === 'input') {
      setFlowState('confirming')
    }
  }, [isPending, flowState])

  // fix: validate trade inputs (Cursor Rule 6)
  const validateTrade = (): string | null => {
    if (!isConnected || !address) {
      return 'Please connect your wallet first'
    }

    if (!property.token_contract_address || !property.orderbook_contract_address) {
      return 'Trading not available - contracts not deployed'
    }

    const tokens = parseFloat(tokenAmount)
    const price = parseFloat(pricePerToken)

    if (!tokens || tokens <= 0) {
      return 'Please enter a valid token amount'
    }

    if (!price || price <= 0) {
      return 'Please enter a valid price per token'
    }

    if (activeTab === 'buy') {
      const totalCost = parseUnits(estimatedCost.toString(), 6)
      if (userUsdcBalance < totalCost) {
        return 'Insufficient USDC balance'
      }
    } else {
      const tokenAmountWei = parseUnits(tokens.toString(), 18)
      if (userTokenBalance < tokenAmountWei) {
        return 'Insufficient token balance'
      }
    }

    return null
  }

  // fix: handle buy order creation (Cursor Rule 4)
  const handleBuyOrder = async () => {
    const validation = validateTrade()
    if (validation) {
      setError(validation)
      return
    }

    try {
      setError(null)
      const tokenAmountWei = parseUnits(tokenAmount, 18)
      const priceWei = parseUnits(pricePerToken, 6)

      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'createBuyOrder',
        args: [tokenAmountWei, priceWei]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create buy order')
      setFlowState('error')
    }
  }

  // fix: handle sell order creation (Cursor Rule 4)
  const handleSellOrder = async () => {
    const validation = validateTrade()
    if (validation) {
      setError(validation)
      return
    }

    try {
      setError(null)
      const tokenAmountWei = parseUnits(tokenAmount, 18)
      const priceWei = parseUnits(pricePerToken, 6)

      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'createSellOrder',
        args: [tokenAmountWei, priceWei]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sell order')
      setFlowState('error')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatBalance = (balance: bigint, decimals: number) => {
    return parseFloat(formatUnits(balance, decimals)).toFixed(decimals === 6 ? 2 : 6)
  }

  const getButtonText = () => {
    switch (flowState) {
      case 'input':
        return activeTab === 'buy' ? 'Place Buy Order' : 'Place Sell Order'
      case 'confirming':
        return 'Confirming Transaction...'
      case 'success':
        return 'Order Placed!'
      case 'error':
        return 'Try Again'
      default:
        return 'Place Order'
    }
  }

  const isActionDisabled = () => {
    if (flowState === 'confirming' || flowState === 'success') return true
    if (!tokenAmount || !pricePerToken) return true
    return !!validateTrade()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Trade Shares - {property.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Market Snapshot */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-openhouse-fg-muted">Buy Price</p>
                  <p className="font-semibold text-openhouse-fg">{formatCurrency(marketData.buyPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-openhouse-fg-muted">Last Price</p>
                  <p className="font-semibold text-openhouse-fg">{formatCurrency(marketData.lastPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-openhouse-fg-muted">Sell Price</p>
                  <p className="font-semibold text-openhouse-fg">{formatCurrency(marketData.sellPrice)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tab Selection */}
          <div className="flex space-x-1 bg-openhouse-bg-muted p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('buy')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'buy'
                  ? 'bg-openhouse-success text-white shadow-sm'
                  : 'text-openhouse-fg hover:text-openhouse-success'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setActiveTab('sell')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sell'
                  ? 'bg-openhouse-danger text-white shadow-sm'
                  : 'text-openhouse-fg hover:text-openhouse-danger'
              }`}
            >
              Sell
            </button>
          </div>

          {/* Trading Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="token-amount">Number of Tokens</Label>
                <Input
                  id="token-amount"
                  type="number"
                  placeholder="0"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  className="mt-1"
                  min="0"
                  step="1"
                  disabled={flowState !== 'input' && flowState !== 'error'}
                />
              </div>
              <div>
                <Label htmlFor="price-per-token">Price per Token (USDC)</Label>
                <Input
                  id="price-per-token"
                  type="number"
                  placeholder="0.00"
                  value={pricePerToken}
                  onChange={(e) => setPricePerToken(e.target.value)}
                  className="mt-1"
                  min="0"
                  step="0.01"
                  disabled={flowState !== 'input' && flowState !== 'error'}
                />
              </div>
            </div>

            {/* Order Summary */}
            {estimatedCost > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-openhouse-accent" />
                    <span className="text-sm font-medium text-openhouse-fg">Order Summary</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-openhouse-fg-muted">Token Amount</span>
                      <span className="font-medium text-openhouse-fg">{tokenAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-openhouse-fg-muted">Price per Token</span>
                      <span className="font-medium text-openhouse-fg">{formatCurrency(parseFloat(pricePerToken))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-openhouse-fg-muted">Protocol Fee (0.5%)</span>
                      <span className="font-medium text-openhouse-fg">{formatCurrency(parseFloat(tokenAmount) * parseFloat(pricePerToken) * 0.005)}</span>
                    </div>
                    <div className="flex justify-between border-t border-openhouse-border pt-2">
                      <span className="text-openhouse-fg-muted font-medium">
                        {activeTab === 'buy' ? 'Total Cost' : 'You Receive'}
                      </span>
                      <span className="font-bold text-openhouse-fg">{formatCurrency(estimatedCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* User Balances */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-openhouse-bg-muted rounded-lg">
              <div className="text-xs text-openhouse-fg-muted">Your USDC Balance</div>
              <div className="font-medium text-openhouse-fg">{formatBalance(userUsdcBalance, 6)} USDC</div>
            </div>
            <div className="p-3 bg-openhouse-bg-muted rounded-lg">
              <div className="text-xs text-openhouse-fg-muted">Your Token Balance</div>
              <div className="font-medium text-openhouse-fg">{formatBalance(userTokenBalance, 18)} Tokens</div>
            </div>
          </div>

          {/* Flow State Indicators */}
          {flowState === 'confirming' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Confirming {activeTab} order transaction...
              </span>
            </div>
          )}

          {flowState === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-success/10 border border-openhouse-success/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-openhouse-success flex-shrink-0" />
              <span className="text-sm text-openhouse-success">
                {activeTab === 'buy' ? 'Buy' : 'Sell'} order placed successfully!
              </span>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-danger/10 border border-openhouse-danger/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-openhouse-danger flex-shrink-0" />
              <span className="text-sm text-openhouse-danger">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={flowState === 'confirming'}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={activeTab === 'buy' ? handleBuyOrder : handleSellOrder}
              disabled={isActionDisabled()}
              className={`flex-1 ${
                activeTab === 'buy' 
                  ? 'bg-openhouse-success hover:bg-openhouse-success/90 text-white'
                  : 'bg-openhouse-danger hover:bg-openhouse-danger/90 text-white'
              }`}
            >
              {flowState === 'confirming' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {getButtonText()}
                </>
              ) : (
                getButtonText()
              )}
            </Button>
          </div>

          {/* Trading Info */}
          <div className="text-xs text-openhouse-fg-muted text-center space-y-1">
            <p>Orders are placed on-chain and matched with other traders.</p>
            <p>A 0.5% protocol fee is charged to both buyers and sellers.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 