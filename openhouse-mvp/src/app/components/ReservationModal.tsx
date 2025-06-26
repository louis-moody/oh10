'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DollarSign, Calculator, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent } from './ui/card'

import { type Property } from '@/lib/supabase'
import { getUsdcAddress, USDC_ABI, getUserUsdcInfo } from '@/lib/contracts'
import { useChainId } from 'wagmi'

interface ReservationModalProps {
  isOpen: boolean
  onClose: () => void
  property: Property
  fundingProgress: {
    raised_amount: number
    progress_percentage: number
  }
  onReservationSuccess: () => void
  existingReservation?: {
    id: string
    usdc_amount: number
    token_amount: number
    payment_status: string
  } | null
}

// fix: get operator address for USDC approvals from environment variable (Cursor Rule 4)
const getOperatorAddress = (): `0x${string}` | null => {
  const address = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS
  if (!address || !address.startsWith('0x')) {
    return null
  }
  return address as `0x${string}`
}

// fix: get treasury address from environment variables (Cursor Rule 4)
const getTreasuryAddress = (): `0x${string}` | null => {
  const address = process.env.NEXT_PUBLIC_TREASURY_ADDRESS
  if (!address || !address.startsWith('0x')) {
    return null
  }
  return address as `0x${string}`
}

// fix: Approval flow states for clear user feedback (Cursor Rule 6)
type ApprovalFlowState = 'input' | 'approving' | 'approved' | 'storing' | 'success' | 'error'

export function ReservationModal({ 
  isOpen, 
  onClose, 
  property, 
  fundingProgress,
  onReservationSuccess,
  existingReservation 
}: ReservationModalProps) {
  const [inputType, setInputType] = useState<'usdc' | 'shares'>('usdc')
  const [usdcAmount, setUsdcAmount] = useState('')
  const [shareAmount, setShareAmount] = useState('')
  const [flowState, setFlowState] = useState<ApprovalFlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userUsdcAllowance, setUserUsdcAllowance] = useState<bigint>(BigInt(0))
  const [isCancelling, setIsCancelling] = useState(false)
  
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // fix: fetch user's USDC balance and allowance (Cursor Rule 4)
  const fetchUserUsdcInfo = useCallback(async () => {
    if (!address || !isConnected) return

    try {
      const operatorAddress = getOperatorAddress()
      if (!operatorAddress) {
        console.error('❌ Operator address not configured in environment')
        setError('Configuration error: Operator address not set')
        return
      }
      
      console.log(`✅ Using operator address for approval: ${operatorAddress}`)
      
      const usdcInfo = await getUserUsdcInfo(chainId, address, operatorAddress)
      if (usdcInfo) {
        setUserUsdcBalance(usdcInfo.balance)
        setUserUsdcAllowance(usdcInfo.allowance)
      }
    } catch (error) {
      // Silent error handling for USDC info fetch
    }
  }, [address, isConnected, chainId])

  // fix: reset modal state when opened (Cursor Rule 4)
  useEffect(() => {
    if (isOpen) {
      if (existingReservation) {
        // fix: populate existing reservation data (Cursor Rule 4)
        setUsdcAmount(existingReservation.usdc_amount.toString())
        setShareAmount(existingReservation.token_amount.toString())
        setFlowState('success')
      } else {
        setInputType('usdc')
        setUsdcAmount('')
        setShareAmount('')
        setFlowState('input')
      }
      setError(null)
      setIsCancelling(false)
      fetchUserUsdcInfo()
    }
  }, [isOpen, existingReservation, fetchUserUsdcInfo])

  // fix: handle successful approval transaction (Cursor Rule 4)
  useEffect(() => {
    if (isConfirmed && hash && flowState === 'approving') {
      setFlowState('storing')
      storeReservation(hash)
    }
  }, [isConfirmed, hash, flowState])

  // fix: update flow state based on transaction status (Cursor Rule 4)
  useEffect(() => {
    if (isPending && flowState === 'input') {
      setFlowState('approving')
    } else if (isConfirming && flowState === 'approving') {
      // Transaction is being confirmed
    }
  }, [isPending, isConfirming, flowState])

  // fix: calculate values based on input type (Cursor Rule 4)
  const calculateAmounts = () => {
    if (inputType === 'usdc' && usdcAmount) {
      const usdc = parseFloat(usdcAmount)
      const shares = Math.floor(usdc / property.price_per_token)
      return { usdc, shares }
    } else if (inputType === 'shares' && shareAmount) {
      const shares = parseInt(shareAmount)
      const usdc = shares * property.price_per_token
      return { usdc, shares }
    }
    return { usdc: 0, shares: 0 }
  }

  const { usdc: calculatedUsdc, shares: calculatedShares } = calculateAmounts()

  // fix: validate reservation inputs (Cursor Rule 6)
  const validateReservation = () => {
    if (!isConnected || !address) {
      return 'Please connect your wallet first'
    }

    const operatorAddress = getOperatorAddress()
    if (!operatorAddress) {
      return 'Configuration error: Please refresh and try again'
    }

    if (calculatedUsdc <= 0 || calculatedShares <= 0) {
      return 'Please enter a valid amount'
    }

    if (calculatedShares > getAvailableShares()) {
      return 'Not enough shares available'
    }

    const requiredUsdc = parseUnits(calculatedUsdc.toString(), 6)
    if (userUsdcBalance < requiredUsdc) {
      return 'Insufficient USDC balance'
    }

    if (new Date(property.funding_deadline) < new Date()) {
      return 'Funding deadline has passed'
    }

    return null
  }

  // fix: get available shares for reservation (Cursor Rule 4)
  const getAvailableShares = () => {
    const reservedShares = Math.floor(fundingProgress.raised_amount / property.price_per_token)
    return property.total_shares - reservedShares
  }

  // fix: handle reservation submission with proper approval flow (Cursor Rule 4)
  const handleReservation = async () => {
    const validationError = validateReservation()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError(null)

      const usdcAddress = getUsdcAddress(chainId)
      if (!usdcAddress) {
        throw new Error('USDC contract not available on this network')
      }

      const operatorAddress = getOperatorAddress()
      if (!operatorAddress) {
        throw new Error('Configuration error: Operator address not configured')
      }

      console.log(`🎯 Approving USDC spend to operator: ${operatorAddress}`)
      console.log(`💰 Required USDC amount: ${calculatedUsdc} USDC`)
      console.log(`🔍 Current allowance: ${formatUnits(userUsdcAllowance, 6)} USDC`)

      const requiredUsdc = parseUnits(calculatedUsdc.toString(), 6)

      // fix: always create a fresh approval for tracking (Cursor Rule 4)
      console.log(`✍️ Creating USDC approval transaction...`)
      await writeContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [operatorAddress, requiredUsdc],
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process reservation')
      setFlowState('error')
    }
  }

  // fix: store reservation via API route after approval (Cursor Rule 3)
  const storeReservation = async (approvalHash: string) => {
    try {
      if (!address) {
        throw new Error('Wallet address required for reservation')
      }

      console.log(`📤 Storing reservation:`, {
        property_id: property.id,
        usdc_amount: calculatedUsdc,
        token_amount: calculatedShares,
        approval_hash: approvalHash,
        wallet: address
      })

      // fix: use API route for server-side validation and authentication (Cursor Rule 3)
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: include cookies for JWT authentication
        body: JSON.stringify({
          property_id: property.id,
          usdc_amount: calculatedUsdc,
          token_amount: calculatedShares,
          approval_hash: approvalHash
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error(`❌ Reservation API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        })
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log(`✅ Reservation created successfully:`, result)
      setFlowState('success')
      
      // fix: notify parent component after successful reservation with smoother transition (Cursor Rule 4)
      setTimeout(() => {
        onReservationSuccess()
        onClose() // Close modal immediately after data refresh
      }, 1500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store reservation')
      setFlowState('error')
    }
  }

  // fix: handle reservation cancellation (Cursor Rule 4)
  const handleCancelReservation = async () => {
    if (!existingReservation) return

    try {
      setIsCancelling(true)
      setError(null)



      const response = await fetch('/api/reservations', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          property_id: property.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      // fix: notify parent component after successful cancellation (Cursor Rule 4)
      onReservationSuccess()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel reservation')
    } finally {
      setIsCancelling(false)
    }
  }

  // fix: handle input changes with validation (Cursor Rule 4)
  const handleInputChange = (value: string, type: 'usdc' | 'shares') => {
    setError(null)
    
    if (type === 'usdc') {
      setUsdcAmount(value)
      setInputType('usdc')
      if (value) {
        const shares = Math.floor(parseFloat(value) / property.price_per_token)
        setShareAmount(shares.toString())
      } else {
        setShareAmount('')
      }
    } else {
      setShareAmount(value)
      setInputType('shares')
      if (value) {
        const usdc = parseInt(value) * property.price_per_token
        setUsdcAmount(usdc.toString())
      } else {
        setUsdcAmount('')
      }
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

  const formatUsdcBalance = (balance: bigint) => {
    return formatCurrency(parseFloat(formatUnits(balance, 6)))
  }

  // fix: determine modal title based on state (Cursor Rule 4)
  const getModalTitle = () => {
    if (existingReservation) {
      return 'Your Reservation'
    }
    return 'Reserve Property Shares'
  }

  // fix: determine button text based on flow state (Cursor Rule 4)
  const getButtonText = () => {
    switch (flowState) {
      case 'input':
        return 'Reserve Shares'
      case 'approving':
        return 'Confirming Approval...'
      case 'approved':
        return 'Approved'
      case 'storing':
        return 'Storing Reservation...'
      case 'success':
        return 'Reserved!'
      case 'error':
        return 'Try Again'
      default:
        return 'Reserve Shares'
    }
  }

  // fix: determine if action button should be disabled (Cursor Rule 4)
  const isActionDisabled = () => {
    if (existingReservation) return false
    if (flowState === 'approving' || flowState === 'storing') return true
    if (flowState === 'success') return true
    if (!calculatedUsdc || !calculatedShares) return true
    return !!validateReservation()
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {getModalTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Property Info */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Property</span>
                  <span className="font-medium text-openhouse-fg">{property.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Price per Share</span>
                  <span className="font-medium text-openhouse-fg">{formatCurrency(property.price_per_token)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-openhouse-fg-muted">Available Shares</span>
                  <span className="font-medium text-openhouse-fg">{getAvailableShares().toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Existing Reservation Display */}
          {existingReservation && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-openhouse-success" />
                  <span className="text-sm font-medium text-openhouse-fg">Current Reservation</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-openhouse-fg-muted">USDC Amount</span>
                    <span className="font-medium text-openhouse-fg">{formatCurrency(existingReservation.usdc_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-openhouse-fg-muted">Shares</span>
                    <span className="font-medium text-openhouse-fg">{existingReservation.token_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-openhouse-fg-muted">Status</span>
                    <span className="font-medium text-openhouse-success capitalize">{existingReservation.payment_status}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Input Section - Only show if no existing reservation */}
          {!existingReservation && (
            <div className="space-y-4">
              {/* Input Type Toggle */}
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => setInputType('usdc')}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    inputType === 'usdc' 
                      ? 'bg-openhouse-accent text-openhouse-accent-fg' 
                      : 'text-openhouse-fg-muted hover:text-openhouse-fg'
                  }`}
                  disabled={flowState !== 'input' && flowState !== 'error'}
                >
                  USDC
                </button>
                <button
                  onClick={() => setInputType('shares')}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    inputType === 'shares' 
                      ? 'bg-openhouse-accent text-openhouse-accent-fg' 
                      : 'text-openhouse-fg-muted hover:text-openhouse-fg'
                  }`}
                  disabled={flowState !== 'input' && flowState !== 'error'}
                >
                  Shares
                </button>
              </div>

              {/* Trading-style input container */}
              <div className="border border-openhouse-border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-openhouse-fg">
                    {inputType === 'usdc' ? 'Deposit amount' : 'Number of shares'}
                  </span>
                  <span className="text-sm text-openhouse-fg-muted">
                    Balance: {formatUsdcBalance(userUsdcBalance)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1 bg-openhouse-bg-muted text-openhouse-fg pl-2 pr-4 py-2 rounded-full">
                    {inputType === 'usdc' ? (
                      <>
                        <DollarSign className="w-4 h-4" />
                        <span className="font-medium text-sm">USDC</span>
                      </>
                    ) : (
                      <>
                        <Calculator className="w-4 h-4" />
                        <span className="font-medium text-sm">Shares</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-end">
                    <Input
                      type="number"
                      value={inputType === 'usdc' ? usdcAmount : shareAmount}
                      onChange={(e) => handleInputChange(e.target.value, inputType)}
                      placeholder="0"
                      className="text-right text-3xl font-medium rounded-none border-none bg-transparent p-0 h-auto focus:ring-0 focus:border-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
                      step={inputType === 'usdc' ? "0.01" : "1"}
                      disabled={flowState !== 'input' && flowState !== 'error'}
                    />
                    {inputType === 'usdc' && calculatedShares > 0 && (
                      <span className="text-sm text-openhouse-fg-muted mt-1">
                        {calculatedShares} shares
                      </span>
                    )}
                    {inputType === 'shares' && calculatedUsdc > 0 && (
                      <span className="text-sm text-openhouse-fg-muted mt-1">
                        {formatCurrency(calculatedUsdc)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Calculation Display */}
              {calculatedUsdc > 0 && calculatedShares > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="w-4 h-4 text-openhouse-accent" />
                      <span className="text-sm font-medium text-openhouse-fg">Reservation Summary</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-openhouse-fg-muted">USDC Amount</span>
                        <span className="font-medium text-openhouse-fg">{formatCurrency(calculatedUsdc)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-openhouse-fg-muted">Shares</span>
                        <span className="font-medium text-openhouse-fg">{calculatedShares.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-openhouse-fg-muted">Price per Share</span>
                        <span className="font-medium text-openhouse-fg">{formatCurrency(property.price_per_token)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* User Balance */}
          <div className="p-3 bg-openhouse-bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-openhouse-fg-muted">Your USDC Balance</span>
              <span className="font-medium text-openhouse-fg">{formatUsdcBalance(userUsdcBalance)}</span>
            </div>
          </div>

          {/* Flow State Indicators */}
          {flowState === 'approving' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Waiting for USDC approval confirmation...
              </span>
            </div>
          )}

          {flowState === 'storing' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-accent/10 border border-openhouse-accent/20 rounded-lg">
              <Loader2 className="w-4 h-4 text-openhouse-accent animate-spin flex-shrink-0" />
              <span className="text-sm text-openhouse-accent">
                Storing your reservation...
              </span>
            </div>
          )}

          {flowState === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-success/10 border border-openhouse-success/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-openhouse-success flex-shrink-0" />
              <span className="text-sm text-openhouse-success">
                {existingReservation ? 'Your reservation is confirmed!' : 'Reservation successful! Your shares are reserved.'}
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
            {existingReservation && existingReservation.payment_status !== 'transferred' && (
              <Button
                variant="outline"
                onClick={handleCancelReservation}
                disabled={isCancelling}
                className="flex-1 border-openhouse-danger text-openhouse-danger hover:bg-openhouse-danger/10"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cancel Reservation
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onClose}
              disabled={flowState === 'approving' || flowState === 'storing' || isCancelling}
              className={existingReservation ? "flex-1" : "flex-1"}
            >
              {existingReservation ? 'Close' : 'Cancel'}
            </Button>
            {!existingReservation && (
              <Button
                onClick={handleReservation}
                disabled={isActionDisabled()}
                className="flex-1 bg-openhouse-accent hover:bg-openhouse-accent/90 text-openhouse-accent-fg"
              >
                {(flowState === 'approving' || flowState === 'storing') ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {getButtonText()}
                  </>
                ) : (
                  getButtonText()
                )}
              </Button>
            )}
          </div>

          {/* Info Note */}
          <div className="text-xs text-openhouse-fg-muted text-center space-y-1">
            <p>By reserving, you approve OpenHouse to collect USDC when funding is complete.</p>
            <p>No payment is taken until the funding goal is reached.</p>
            {existingReservation && existingReservation.payment_status !== 'transferred' && (
              <p className="text-openhouse-accent font-medium">You can cancel your reservation at any time before funding closes.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 