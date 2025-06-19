'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DollarSign, Calculator, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent } from './ui/card'

import { supabase, type Property } from '@/lib/supabase'
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
}

// fix: OpenHouse treasury address for USDC approvals (Cursor Rule 4)
const TREASURY_ADDRESS = "0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819" as const

export function ReservationModal({ 
  isOpen, 
  onClose, 
  property, 
  fundingProgress,
  onReservationSuccess 
}: ReservationModalProps) {
  const [inputType, setInputType] = useState<'usdc' | 'shares'>('usdc')
  const [usdcAmount, setUsdcAmount] = useState('')
  const [shareAmount, setShareAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userUsdcAllowance, setUserUsdcAllowance] = useState<bigint>(BigInt(0))
  
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
      const usdcInfo = await getUserUsdcInfo(chainId, address, TREASURY_ADDRESS)
      if (usdcInfo) {
        setUserUsdcBalance(usdcInfo.balance)
        setUserUsdcAllowance(usdcInfo.allowance)
      }
    } catch (error) {
      console.error('Failed to fetch USDC info:', error)
    }
  }, [address, isConnected, chainId])

  // fix: reset modal state when opened (Cursor Rule 4)
  useEffect(() => {
    if (isOpen) {
      setInputType('usdc')
      setUsdcAmount('')
      setShareAmount('')
      setError(null)
      setSuccess(false)
      setIsProcessing(false)
      fetchUserUsdcInfo()
    }
  }, [isOpen, fetchUserUsdcInfo])

  // fix: handle successful reservation completion (Cursor Rule 4)
  const handleReservationSuccess = useCallback(async () => {
    if (hash) {
      await storeReservation(hash)
      setTimeout(() => {
        onReservationSuccess()
      }, 2000)
    }
  }, [hash, onReservationSuccess])

  // fix: handle successful approval transaction (Cursor Rule 4)
  useEffect(() => {
    if (isConfirmed && hash && !success) {
      handleReservationSuccess()
    }
  }, [isConfirmed, hash, success, handleReservationSuccess])

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
      return 'Please connect your wallet'
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

  // fix: handle reservation submission (Cursor Rule 4)
  const handleReservation = async () => {
    const validationError = validateReservation()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setIsProcessing(true)
      setError(null)

      const usdcAddress = getUsdcAddress(chainId)
      if (!usdcAddress) {
        throw new Error('USDC contract not available on this network')
      }

      const requiredUsdc = parseUnits(calculatedUsdc.toString(), 6)

      // fix: check if user needs to approve more USDC (Cursor Rule 4)
      if (userUsdcAllowance < requiredUsdc) {
        // fix: request USDC approval for treasury address (Cursor Rule 4)
        await writeContract({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [TREASURY_ADDRESS, requiredUsdc],
        })
      } else {
        // fix: user already has sufficient allowance, proceed to store reservation (Cursor Rule 4)
        await storeReservation(hash || '0x')
      }

    } catch (err) {
      console.error('Reservation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process reservation')
      setIsProcessing(false)
    }
  }

  // fix: store reservation in Supabase after successful approval (Cursor Rule 4)
  const storeReservation = async (approvalHash: string) => {
    try {
      if (!address || !supabase) {
        throw new Error('Missing required data for reservation')
      }

      // fix: insert reservation into payment_authorizations table (Cursor Rule 4)
      const { error: insertError } = await supabase
        .from('payment_authorizations')
        .upsert({
          property_id: property.id,
          wallet_address: address.toLowerCase(),
          usdc_amount: calculatedUsdc,
          token_amount: calculatedShares,
          approval_hash: approvalHash,
          approval_timestamp: new Date().toISOString(),
          payment_status: 'approved',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'property_id,wallet_address'
        })

      if (insertError) {
        throw new Error(`Failed to store reservation: ${insertError.message}`)
      }

      setSuccess(true)
      setIsProcessing(false)

    } catch (err) {
      console.error('Store reservation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to store reservation')
      setIsProcessing(false)
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

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Reserve Property Shares
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

          {/* Input Section */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="usdc-amount">USDC Amount</Label>
                <Input
                  id="usdc-amount"
                  type="number"
                  placeholder="0.00"
                  value={usdcAmount}
                  onChange={(e) => handleInputChange(e.target.value, 'usdc')}
                  className="mt-1"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="share-amount">Number of Shares</Label>
                <Input
                  id="share-amount"
                  type="number"
                  placeholder="0"
                  value={shareAmount}
                  onChange={(e) => handleInputChange(e.target.value, 'shares')}
                  className="mt-1"
                  min="0"
                  step="1"
                />
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

          {/* User Balance */}
          <div className="p-3 bg-openhouse-bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-openhouse-fg-muted">Your USDC Balance</span>
              <span className="font-medium text-openhouse-fg">{formatUsdcBalance(userUsdcBalance)}</span>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-danger/10 border border-openhouse-danger/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-openhouse-danger flex-shrink-0" />
              <span className="text-sm text-openhouse-danger">{error}</span>
            </div>
          )}

          {/* Success Display */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-openhouse-success/10 border border-openhouse-success/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-openhouse-success flex-shrink-0" />
              <span className="text-sm text-openhouse-success">
                Reservation successful! Your shares are reserved.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing || isPending || isConfirming}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReservation}
              disabled={
                isProcessing || 
                isPending || 
                isConfirming || 
                !calculatedUsdc || 
                !calculatedShares || 
                !!validateReservation() ||
                success
              }
              className="flex-1 bg-openhouse-accent hover:bg-openhouse-accent/90 text-openhouse-accent-fg"
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isPending ? 'Confirming...' : 'Processing...'}
                </>
              ) : success ? (
                'Reserved!'
              ) : (
                'Reserve Shares'
              )}
            </Button>
          </div>

          {/* Info Note */}
          <div className="text-xs text-openhouse-fg-muted text-center space-y-1">
            <p>By reserving, you approve OpenHouse to collect USDC when funding is complete.</p>
            <p>No payment is taken until the funding goal is reached.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 