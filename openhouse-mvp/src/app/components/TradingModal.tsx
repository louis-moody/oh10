'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { TrendingUp, AlertCircle, CheckCircle, Loader2, DollarSign, Clock } from 'lucide-react'
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
type FlowState = 'input' | 'checking_orderbook' | 'using_fallback' | 'executing' | 'success' | 'error'

// fix: simplified retail trading modal with fallback liquidity (Cursor Rule 4)
export function TradingModal({ 
  isOpen, 
  onClose, 
  property,
  onTradeSuccess
}: TradingModalProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>('buy')
  const [amount, setAmount] = useState('') // Unified amount input
  const [flowState, setFlowState] = useState<FlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [timeoutCountdown, setTimeoutCountdown] = useState<number>(0)
  
  // fix: user balances and pricing (Cursor Rule 4)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userTokenBalance, setUserTokenBalance] = useState<bigint>(BigInt(0))
  const [currentPrice, setCurrentPrice] = useState<number>(property.price_per_token)
  const [usingFallback, setUsingFallback] = useState<boolean>(false)
  
  // fix: trade calculations (Cursor Rule 4)
  const [estimatedOutput, setEstimatedOutput] = useState<number>(0)
  const [totalCost, setTotalCost] = useState<number>(0)

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // fix: get USDC contract address (Cursor Rule 4)
  const getUsdcAddress = () => {
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

  // fix: fetch current OpenHouse price from database (Cursor Rule 4)
  const fetchCurrentPrice = useCallback(async () => {
    try {
      const response = await fetch(`/api/fallback?property_id=${property.id}&action=get_price`)
      if (response.ok) {
        const data = await response.json()
        setCurrentPrice(data.current_price || property.price_per_token)
      }
    } catch (error) {
      console.error('Failed to fetch current price:', error)
      setCurrentPrice(property.price_per_token) // fallback to initial price
    }
  }, [property.id, property.price_per_token])

  // fix: fetch user USDC balance (Cursor Rule 4)
  const fetchUserBalances = useCallback(async () => {
    if (!address || !isConnected) return

    try {
      const usdcInfo = await getUserUsdcInfo(chainId, address, getUsdcAddress() as `0x${string}`)
      if (usdcInfo) {
        setUserUsdcBalance(usdcInfo.balance)
      }
    } catch (error) {
      console.error('Failed to fetch user balances:', error)
    }
  }, [address, isConnected, chainId])

  // fix: update token balance when data changes (Cursor Rule 4)
  useEffect(() => {
    if (tokenBalance) {
      setUserTokenBalance(tokenBalance as bigint)
    }
  }, [tokenBalance])

  // fix: fetch data when modal opens (Cursor Rule 4)
  useEffect(() => {
    if (isOpen && isConnected && address) {
      fetchUserBalances()
      fetchCurrentPrice()
    }
  }, [isOpen, isConnected, address, fetchUserBalances, fetchCurrentPrice])

  // fix: calculate trade amounts in real-time (Cursor Rule 4)
  useEffect(() => {
    if (!amount || !currentPrice) {
      setEstimatedOutput(0)
      setTotalCost(0)
      return
    }

    const inputAmount = parseFloat(amount)
    if (inputAmount <= 0) {
      setEstimatedOutput(0)
      setTotalCost(0)
      return
    }

    if (activeTab === 'buy') {
      // User enters USDC amount, calculate tokens received
      // No protocol fees for fallback trades (PRD requirement)
      const tokensReceived = inputAmount / currentPrice
      setEstimatedOutput(tokensReceived)
      setTotalCost(inputAmount)
    } else {
      // User enters token amount, calculate USDC received
      // No protocol fees for fallback trades (PRD requirement)
      const usdcReceived = inputAmount * currentPrice
      setEstimatedOutput(usdcReceived)
      setTotalCost(inputAmount)
    }
  }, [amount, currentPrice, activeTab])

  // fix: reset form when switching tabs (Cursor Rule 4)
  useEffect(() => {
    setAmount('')
    setError(null)
    setSuccessMessage(null)
    setFlowState('input')
    setUsingFallback(false)
    setTimeoutCountdown(0)
  }, [activeTab])

  // fix: reset modal state when opened (Cursor Rule 4)
  useEffect(() => {
    if (isOpen) {
      setActiveTab('buy')
      setAmount('')
      setFlowState('input')
      setError(null)
      setSuccessMessage(null)
      setUsingFallback(false)
      setTimeoutCountdown(0)
    }
  }, [isOpen])

  // fix: handle successful transaction (Cursor Rule 4)
  useEffect(() => {
    if (isConfirmed && hash) {
      setFlowState('success')
      const message = activeTab === 'buy' 
        ? `Successfully bought ${estimatedOutput.toFixed(2)} tokens for ${formatCurrency(totalCost)}!`
        : `Successfully sold ${totalCost} tokens for ${formatCurrency(estimatedOutput)}!`
      setSuccessMessage(message)
      
      // Record transaction and refresh
      recordTransaction()
      setTimeout(() => {
        onTradeSuccess()
        onClose()
      }, 3000)
    }
  }, [isConfirmed, hash, activeTab, estimatedOutput, totalCost, onTradeSuccess, onClose])

  // fix: record transaction with fallback source tracking (Cursor Rule 4)
  const recordTransaction = async () => {
    if (!address || !hash) return

    try {
      await fetch('/api/trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          transaction_type: activeTab,
          token_amount: activeTab === 'buy' ? estimatedOutput : totalCost,
          usdc_amount: activeTab === 'buy' ? totalCost : estimatedOutput,
          price_per_token: currentPrice,
          transaction_hash: hash,
          execution_source: usingFallback ? 'fallback' : 'orderbook',
          fallback_reason: usingFallback ? 'insufficient_liquidity' : null
        })
      })
    } catch (error) {
      console.error('Failed to record transaction:', error)
    }
  }

  // fix: validate trade inputs (Cursor Rule 4)
  const validateTrade = (): string | null => {
    if (!amount || parseFloat(amount) <= 0) {
      return 'Please enter a valid amount'
    }

    const inputAmount = parseFloat(amount)

    if (activeTab === 'buy') {
      const requiredUsdc = parseUnits(inputAmount.toString(), 6)
      if (requiredUsdc > userUsdcBalance) {
        return 'Insufficient USDC balance'
      }
    } else {
      const requiredTokens = parseUnits(inputAmount.toString(), 18)
      if (requiredTokens > userTokenBalance) {
        return 'Insufficient token balance'
      }
    }

    return null
  }

  // fix: 5-second timeout mechanism for order book → fallback (PRD requirement)
  const checkOrderBookAndFallback = async () => {
    setFlowState('checking_orderbook')
    setTimeoutCountdown(5)
    
    // Start 5-second countdown
    const countdownInterval = setInterval(() => {
      setTimeoutCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    try {
      // Check if fallback should be used (PRD: 5-second timeout)
      const fallbackResponse = await fetch('/api/fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          trade_type: activeTab,
          amount_usdc: activeTab === 'buy' ? parseFloat(amount) : estimatedOutput
        })
      })

      const fallbackData = await fallbackResponse.json()
      
      // Wait for full 5-second timeout (PRD requirement)
      setTimeout(() => {
        clearInterval(countdownInterval)
        setTimeoutCountdown(0)
        
        if (fallbackData.should_use_fallback || !property.orderbook_contract_address) {
          // Use fallback liquidity
          setUsingFallback(true)
          setFlowState('using_fallback')
          executeFallbackTrade()
        } else {
          // Use order book (not implemented in this scope)
          setError('Order book trading not yet available. Using fallback liquidity.')
          setUsingFallback(true)
          setFlowState('using_fallback')
          executeFallbackTrade()
        }
      }, 5000) // Exact 5-second timeout per PRD

    } catch (error) {
      clearInterval(countdownInterval)
      setError('Failed to check trading options. Please try again.')
      setFlowState('error')
    }
  }

  // fix: safe trading execution via API (Cursor Rule 4)
  const executeFallbackTrade = async () => {
    if (!amount || !currentPrice || !address) return

    setFlowState('executing')
    setError('')

    try {
      const response = await fetch('/api/trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property.id.toString(),
          trade_type: activeTab,
          amount: parseFloat(amount),
          execution_method: 'fallback',
          price_per_token: currentPrice
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Trade execution failed')
      }

      setFlowState('success')
      setSuccessMessage(
        activeTab === 'buy' 
          ? `Successfully bought ${estimatedOutput.toFixed(2)} tokens for ${formatCurrency(totalCost)}!`
          : `Successfully sold ${totalCost} tokens for ${formatCurrency(estimatedOutput)}!`
      )
      
      // Refresh balances and close modal after delay
      setTimeout(() => {
        onTradeSuccess()
        onClose()
      }, 3000)
      
    } catch (error) {
      console.error('Fallback trade error:', error)
      setError(error instanceof Error ? error.message : 'Trade execution failed')
      setFlowState('error')
    }
  }

  // fix: main action handler (Cursor Rule 4)
  const handleMainAction = () => {
    const validationError = validateTrade()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    checkOrderBookAndFallback()
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

  const formatBalance = (balance: bigint, decimals: number) => {
    return parseFloat(formatUnits(balance, decimals)).toFixed(decimals === 6 ? 2 : 0)
  }

  const getMaxAmount = () => {
    if (activeTab === 'buy') {
      return formatBalance(userUsdcBalance, 6)
    } else {
      return formatBalance(userTokenBalance, 18)
    }
  }

  const getMainButtonText = () => {
    if (flowState === 'checking_orderbook') return `Checking liquidity... (${timeoutCountdown}s)`
    if (flowState === 'using_fallback') return 'Using OpenHouse liquidity...'
    if (flowState === 'executing') return `${activeTab === 'buy' ? 'Buying' : 'Selling'}...`
    
    return activeTab === 'buy' ? `Buy ${estimatedOutput.toFixed(2)} tokens` : `Sell for ${formatCurrency(estimatedOutput)}`
  }

  const isMainButtonDisabled = () => {
    return !amount || 
           parseFloat(amount) <= 0 || 
           flowState === 'checking_orderbook' || 
           flowState === 'using_fallback' ||
           flowState === 'executing' ||
           isPending
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" aria-describedby="trading-modal-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Trade {property.name}
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
              Buy
            </button>
            <button
              onClick={() => setActiveTab('sell')}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'sell'
                  ? 'bg-openhouse-danger text-white shadow-sm'
                  : 'text-openhouse-fg hover:text-openhouse-danger'
              }`}
            >
              Sell
            </button>
          </div>

          {/* Single Amount Input (Retail Style) */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount" className="text-sm font-medium">
                {activeTab === 'buy' ? 'Amount to spend (USDC)' : 'Tokens to sell'}
              </Label>
              <div className="relative mt-1">
                {activeTab === 'buy' && (
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-openhouse-fg-muted" />
                )}
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${activeTab === 'buy' ? 'pl-9 pr-16' : 'pr-16'} py-3 text-lg`}
                  min="0"
                  step={activeTab === 'buy' ? "0.01" : "1"}
                  disabled={flowState !== 'input' && flowState !== 'error'}
                />
                <button
                  onClick={() => setAmount(getMaxAmount())}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-openhouse-accent hover:text-openhouse-accent/80 font-medium"
                  disabled={flowState !== 'input' && flowState !== 'error'}
                >
                  MAX
                </button>
              </div>
              <p className="text-xs text-openhouse-fg-muted mt-1">
                Balance: {activeTab === 'buy' 
                  ? `${formatBalance(userUsdcBalance, 6)} USDC`
                  : `${formatBalance(userTokenBalance, 18)} tokens`
                }
              </p>
            </div>

            {/* Output Estimate */}
            {estimatedOutput > 0 && (
              <div className="p-4 bg-openhouse-bg-muted rounded-lg">
                <p className="text-sm text-openhouse-fg-muted">You will receive:</p>
                <p className="text-xl font-semibold text-openhouse-fg">
                  {activeTab === 'buy' 
                    ? `${estimatedOutput.toFixed(2)} tokens`
                    : formatCurrency(estimatedOutput)
                  }
                </p>
                <p className="text-xs text-openhouse-fg-muted mt-1">
                  At {formatCurrency(currentPrice)} per token • OpenHouse Price
                </p>
                {usingFallback && (
                  <p className="text-xs text-openhouse-accent mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Using OpenHouse liquidity • No fees
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Trading Status */}
          {flowState === 'checking_orderbook' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Checking order book liquidity... ({timeoutCountdown}s)
              </span>
            </div>
          )}

          {flowState === 'using_fallback' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-success/10 border border-openhouse-success/20 rounded-lg">
              <Clock className="w-4 h-4 text-openhouse-success flex-shrink-0" />
              <span className="text-sm text-openhouse-success">
                Using OpenHouse liquidity • Guaranteed execution • No fees
              </span>
            </div>
          )}

          {flowState === 'executing' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Executing trade...
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
              disabled={flowState === 'checking_orderbook' || flowState === 'using_fallback' || flowState === 'executing'}
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
              {(flowState === 'checking_orderbook' || flowState === 'using_fallback' || flowState === 'executing') ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {getMainButtonText()}
                </>
              ) : (
                getMainButtonText()
              )}
            </Button>
          </div>

          {/* Fee Info */}
          <div className="text-xs text-openhouse-fg-muted text-center">
            <p>OpenHouse liquidity trades have no fees • Order book trades may have protocol fees</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 