'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { TrendingUp, AlertCircle, CheckCircle, Loader2, DollarSign } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits, maxUint256 } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent } from './ui/card'

import { type Property } from '@/lib/supabase'
import { OrderBookExchangeABI, PROPERTY_SHARE_TOKEN_ABI, USDC_ABI, getUserUsdcInfo } from '@/lib/contracts'
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

type TradeTab = 'buy' | 'sell'
type FlowState = 'input' | 'approving' | 'trading' | 'success' | 'error'

// fix: simplified retail-friendly trading modal (Cursor Rule 4)
export function TradingModal({ 
  isOpen, 
  onClose, 
  property,
  onTradeSuccess
}: TradingModalProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>('buy')
  const [usdcAmount, setUsdcAmount] = useState('')
  const [tokenAmount, setTokenAmount] = useState('')
  const [flowState, setFlowState] = useState<FlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // fix: user balances (Cursor Rule 4)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userTokenBalance, setUserTokenBalance] = useState<bigint>(BigInt(0))
  const [tokenAllowance, setTokenAllowance] = useState<bigint>(BigInt(0))
  
  // fix: price discovery (Cursor Rule 4)
  const [currentPrice, setCurrentPrice] = useState<number>(property.price_per_token)
  const [estimatedTokens, setEstimatedTokens] = useState<number>(0)
  const [estimatedUsdc, setEstimatedUsdc] = useState<number>(0)

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // fix: get USDC contract address based on network (Cursor Rule 4)
  const getUsdcAddress = () => {
    // Base Sepolia for development, Base Mainnet for production
    return chainId === 8453 
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
  }

  // fix: fetch user token balance (Cursor Rule 4)
  const { data: tokenBalance } = useReadContract({
    address: property.token_contract_address as `0x${string}`,
    abi: PROPERTY_SHARE_TOKEN_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!property.token_contract_address
    }
  })

  // fix: fetch token allowance for sell orders (Cursor Rule 4)
  const { data: allowanceData } = useReadContract({
    address: property.token_contract_address as `0x${string}`,
    abi: PROPERTY_SHARE_TOKEN_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, property.orderbook_contract_address as `0x${string}`],
    query: {
      enabled: !!address && !!property.token_contract_address && !!property.orderbook_contract_address
    }
  })

  // fix: fetch user USDC balance on modal open (Cursor Rule 4)
  const fetchUserBalances = useCallback(async () => {
    if (!address || !isConnected) return

    try {
      // fix: fetch USDC balance (Cursor Rule 4)
      const usdcInfo = await getUserUsdcInfo(chainId, address, property.orderbook_contract_address as `0x${string}`)
      if (usdcInfo) {
        setUserUsdcBalance(usdcInfo.balance)
      }
    } catch (error) {
      console.error('Failed to fetch user balances:', error)
    }
  }, [address, isConnected, chainId, property.orderbook_contract_address])

  // fix: update balances when data changes (Cursor Rule 4)
  useEffect(() => {
    if (tokenBalance) {
      setUserTokenBalance(tokenBalance as bigint)
    }
  }, [tokenBalance])

  useEffect(() => {
    if (allowanceData) {
      setTokenAllowance(allowanceData as bigint)
    }
  }, [allowanceData])

  // fix: fetch balances when modal opens (Cursor Rule 4)
  useEffect(() => {
    if (isOpen && isConnected && address) {
      fetchUserBalances()
      setCurrentPrice(property.price_per_token) // Set default price
    }
  }, [isOpen, isConnected, address, fetchUserBalances, property.price_per_token])

  // fix: calculate estimated tokens when buying (Cursor Rule 4)
  useEffect(() => {
    if (activeTab === 'buy' && usdcAmount && currentPrice > 0) {
      const usdc = parseFloat(usdcAmount)
      const protocolFee = usdc * 0.005 // 0.5% fee
      const availableUsdc = usdc - protocolFee
      const tokens = availableUsdc / currentPrice
      setEstimatedTokens(Math.max(0, tokens))
    } else {
      setEstimatedTokens(0)
    }
  }, [usdcAmount, currentPrice, activeTab])

  // fix: calculate estimated USDC when selling (Cursor Rule 4)
  useEffect(() => {
    if (activeTab === 'sell' && tokenAmount && currentPrice > 0) {
      const tokens = parseFloat(tokenAmount)
      const grossUsdc = tokens * currentPrice
      const protocolFee = grossUsdc * 0.005 // 0.5% fee
      const netUsdc = grossUsdc - protocolFee
      setEstimatedUsdc(Math.max(0, netUsdc))
    } else {
      setEstimatedUsdc(0)
    }
  }, [tokenAmount, currentPrice, activeTab])

  // fix: reset form when switching tabs (Cursor Rule 4)
  useEffect(() => {
    setUsdcAmount('')
    setTokenAmount('')
    setError(null)
    setSuccessMessage(null)
    setFlowState('input')
  }, [activeTab])

  // fix: reset modal state when opened (Cursor Rule 4)
  useEffect(() => {
    if (isOpen) {
      setActiveTab('buy')
      setUsdcAmount('')
      setTokenAmount('')
      setFlowState('input')
      setError(null)
      setSuccessMessage(null)
    }
  }, [isOpen])

  // fix: handle successful transaction (Cursor Rule 4)
  useEffect(() => {
    if (isConfirmed && hash) {
      setFlowState('success')
      if (activeTab === 'buy') {
        setSuccessMessage(`Successfully bought ${estimatedTokens.toFixed(2)} tokens!`)
      } else {
        setSuccessMessage(`Successfully sold ${tokenAmount} tokens for $${estimatedUsdc.toFixed(2)}!`)
      }
      
      // fix: record transaction in database (Cursor Rule 4)
      recordTransaction()
      
      // Refresh balances and close modal after delay
      setTimeout(() => {
        onTradeSuccess()
        onClose()
      }, 3000)
    }
  }, [isConfirmed, hash, activeTab, estimatedTokens, tokenAmount, estimatedUsdc, onTradeSuccess, onClose])

  // fix: record transaction in database via API (Cursor Rule 4)
  const recordTransaction = async () => {
    if (!address || !hash) return

    try {
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          property_id: property.id,
          order_type: activeTab,
          token_amount: activeTab === 'buy' ? estimatedTokens.toString() : tokenAmount,
          usdc_amount: activeTab === 'buy' ? usdcAmount : estimatedUsdc.toString(),
          price_per_token: currentPrice.toString(),
          transaction_hash: hash,
        }),
      })

      if (!response.ok) {
        console.warn('Failed to record transaction in database')
      }
    } catch (error) {
      console.error('Error recording transaction:', error)
    }
  }

  // fix: validate buy order (Cursor Rule 6)
  const validateBuyOrder = (): string | null => {
    if (!isConnected || !address) return 'Please connect your wallet'
    if (!usdcAmount || parseFloat(usdcAmount) <= 0) return 'Enter amount to spend'
    
    const requiredUsdc = parseUnits(usdcAmount, 6)
    if (userUsdcBalance < requiredUsdc) return 'Insufficient USDC balance'
    
    if (estimatedTokens <= 0) return 'Invalid token amount'
    
    return null
  }

  // fix: validate sell order (Cursor Rule 6)
  const validateSellOrder = (): string | null => {
    if (!isConnected || !address) return 'Please connect your wallet'
    if (!tokenAmount || parseFloat(tokenAmount) <= 0) return 'Enter tokens to sell'
    
    const requiredTokens = parseUnits(tokenAmount, 18)
    if (userTokenBalance < requiredTokens) return 'Insufficient token balance'
    
    return null
  }

  // fix: check if approval is needed for sell (Cursor Rule 4)
  const needsApproval = (): boolean => {
    if (activeTab !== 'sell' || !tokenAmount) return false
    const requiredTokens = parseUnits(tokenAmount, 18)
    return tokenAllowance < requiredTokens
  }

  // fix: handle token approval for selling (Cursor Rule 4)
  const handleApproval = async () => {
    if (!property.token_contract_address || !property.orderbook_contract_address) {
      setError('Trading contracts not available')
      return
    }

    try {
      setFlowState('approving')
      setError(null)

      writeContract({
        address: property.token_contract_address as `0x${string}`,
        abi: PROPERTY_SHARE_TOKEN_ABI,
        functionName: 'approve',
        args: [property.orderbook_contract_address as `0x${string}`, maxUint256]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve tokens')
      setFlowState('error')
    }
  }

  // fix: handle buy order (Cursor Rule 4)
  const handleBuyOrder = async () => {
    const validation = validateBuyOrder()
    if (validation) {
      setError(validation)
      return
    }

    if (!property.orderbook_contract_address) {
      setError('Trading not available')
      return
    }

    try {
      setFlowState('trading')
      setError(null)

      const tokenAmountWei = parseUnits(estimatedTokens.toString(), 18)
      const priceWei = parseUnits(currentPrice.toString(), 6)

      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'createBuyOrder',
        args: [tokenAmountWei, priceWei]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place buy order')
      setFlowState('error')
    }
  }

  // fix: handle sell order (Cursor Rule 4)
  const handleSellOrder = async () => {
    const validation = validateSellOrder()
    if (validation) {
      setError(validation)
      return
    }

    if (!property.orderbook_contract_address) {
      setError('Trading not available')
      return
    }

    try {
      setFlowState('trading')
      setError(null)

      const tokenAmountWei = parseUnits(tokenAmount, 18)
      const priceWei = parseUnits(currentPrice.toString(), 6)

      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'createSellOrder',
        args: [tokenAmountWei, priceWei]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place sell order')
      setFlowState('error')
    }
  }

  // fix: main action handler (Cursor Rule 4)
  const handleMainAction = () => {
    if (activeTab === 'sell' && needsApproval()) {
      handleApproval()
    } else if (activeTab === 'buy') {
      handleBuyOrder()
    } else {
      handleSellOrder()
    }
  }

  // fix: format currency display (Cursor Rule 4)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  // fix: format balance display (Cursor Rule 4)
  const formatBalance = (balance: bigint, decimals: number) => {
    const formatted = parseFloat(formatUnits(balance, decimals))
    return decimals === 6 ? formatted.toFixed(2) : formatted.toFixed(6)
  }

  // fix: get max amounts for quick buttons (Cursor Rule 4)
  const getMaxUsdcAmount = () => {
    return formatBalance(userUsdcBalance, 6)
  }

  const getMaxTokenAmount = () => {
    return formatBalance(userTokenBalance, 18)
  }

  // fix: get main button text (Cursor Rule 4)
  const getMainButtonText = () => {
    if (flowState === 'approving') return 'Approving Tokens...'
    if (flowState === 'trading') return activeTab === 'buy' ? 'Buying Tokens...' : 'Selling Tokens...'
    if (flowState === 'success') return 'Success!'
    
    if (activeTab === 'sell' && needsApproval()) {
      return 'Approve Tokens to Trade'
    }
    
    return activeTab === 'buy' ? 'Buy Tokens' : 'Sell Tokens'
  }

  // fix: check if main button should be disabled (Cursor Rule 4)
  const isMainButtonDisabled = () => {
    if (flowState === 'approving' || flowState === 'trading' || flowState === 'success') return true
    
    if (activeTab === 'buy') {
      return !!validateBuyOrder() || !usdcAmount
    } else {
      return !!validateSellOrder() || !tokenAmount
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" aria-describedby="trading-modal-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Trade Shares - {property.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6" id="trading-modal-description">
          {/* Tab Selection */}
          <div className="flex space-x-1 bg-openhouse-bg-muted p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('buy')}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'buy'
                  ? 'bg-openhouse-success text-white shadow-sm'
                  : 'text-openhouse-fg hover:text-openhouse-success'
              }`}
            >
              Buy Shares
            </button>
            <button
              onClick={() => setActiveTab('sell')}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sell'
                  ? 'bg-openhouse-danger text-white shadow-sm'
                  : 'text-openhouse-fg hover:text-openhouse-danger'
              }`}
            >
              Sell Shares
            </button>
          </div>

          {/* Buy Tab Content */}
          {activeTab === 'buy' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="usdc-amount" className="text-sm font-medium">
                  Amount to spend (USDC)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-openhouse-fg-muted" />
                  <Input
                    id="usdc-amount"
                    type="number"
                    placeholder="0.00"
                    value={usdcAmount}
                    onChange={(e) => setUsdcAmount(e.target.value)}
                    className="pl-9 pr-16 py-3 text-lg"
                    min="0"
                    step="0.01"
                    disabled={flowState !== 'input' && flowState !== 'error'}
                  />
                  <button
                    onClick={() => setUsdcAmount(getMaxUsdcAmount())}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-openhouse-accent hover:text-openhouse-accent/80 font-medium"
                    disabled={flowState !== 'input' && flowState !== 'error'}
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-openhouse-fg-muted mt-1">
                  Balance: {formatBalance(userUsdcBalance, 6)} USDC
                </p>
              </div>

              {estimatedTokens > 0 && (
                <div className="p-4 bg-openhouse-bg-muted rounded-lg">
                  <p className="text-sm text-openhouse-fg-muted">You will receive:</p>
                  <p className="text-xl font-semibold text-openhouse-fg">
                    {estimatedTokens.toFixed(2)} tokens
                  </p>
                  <p className="text-xs text-openhouse-fg-muted mt-1">
                    At {formatCurrency(currentPrice)} per token
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sell Tab Content */}
          {activeTab === 'sell' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="token-amount" className="text-sm font-medium">
                  Tokens to sell
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="token-amount"
                    type="number"
                    placeholder="0"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    className="pr-16 py-3 text-lg"
                    min="0"
                    step="1"
                    disabled={flowState !== 'input' && flowState !== 'error'}
                  />
                  <button
                    onClick={() => setTokenAmount(getMaxTokenAmount())}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-openhouse-accent hover:text-openhouse-accent/80 font-medium"
                    disabled={flowState !== 'input' && flowState !== 'error'}
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-openhouse-fg-muted mt-1">
                  Balance: {formatBalance(userTokenBalance, 18)} tokens
                </p>
              </div>

              {estimatedUsdc > 0 && (
                <div className="p-4 bg-openhouse-bg-muted rounded-lg">
                  <p className="text-sm text-openhouse-fg-muted">You will receive:</p>
                  <p className="text-xl font-semibold text-openhouse-fg">
                    {formatCurrency(estimatedUsdc)}
                  </p>
                  <p className="text-xs text-openhouse-fg-muted mt-1">
                    At {formatCurrency(currentPrice)} per token
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Current Balances */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-openhouse-bg-muted rounded-lg text-center">
              <div className="text-xs text-openhouse-fg-muted">USDC</div>
              <div className="font-medium text-openhouse-fg">
                {formatBalance(userUsdcBalance, 6)}
              </div>
            </div>
            <div className="p-3 bg-openhouse-bg-muted rounded-lg text-center">
              <div className="text-xs text-openhouse-fg-muted">Tokens</div>
              <div className="font-medium text-openhouse-fg">
                {formatBalance(userTokenBalance, 18)}
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {flowState === 'approving' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Approving tokens for trading...
              </span>
            </div>
          )}

          {flowState === 'trading' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                {activeTab === 'buy' ? 'Placing buy order...' : 'Placing sell order...'}
              </span>
            </div>
          )}

          {flowState === 'success' && successMessage && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-success/10 border border-openhouse-success/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-openhouse-success flex-shrink-0" />
              <span className="text-sm text-openhouse-success">{successMessage}</span>
            </div>
          )}

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
              disabled={flowState === 'approving' || flowState === 'trading'}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMainAction}
              disabled={isMainButtonDisabled()}
              className={`flex-1 ${
                activeTab === 'buy' 
                  ? 'bg-openhouse-success hover:bg-openhouse-success/90 text-white'
                  : 'bg-openhouse-danger hover:bg-openhouse-danger/90 text-white'
              }`}
            >
              {(flowState === 'approving' || flowState === 'trading') ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {getMainButtonText()}
                </>
              ) : (
                getMainButtonText()
              )}
            </Button>
          </div>

          {/* Trading Fee Info */}
          <div className="text-xs text-openhouse-fg-muted text-center">
            <p>A 0.5% protocol fee is charged to both buyers and sellers.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 