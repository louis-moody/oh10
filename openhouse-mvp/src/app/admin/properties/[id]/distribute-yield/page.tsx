'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, DollarSign, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { supabase } from '@/lib/supabase'
import { YIELD_DISTRIBUTOR_ABI, getUsdcAddress, ERC20_ABI } from '@/lib/contracts'

interface Property {
  id: string
  name: string
  status: string
  total_shares: number
  price_per_token: number
}

interface TokenDetails {
  yield_distributor_address: string
  contract_address: string
  rental_wallet_address?: string
  token_name: string
  token_symbol: string
}

interface DistributionHistory {
  id: string
  usdc_amount: number
  tx_hash: string
  distributed_at: string
}

// fix: admin yield distribution page component (Cursor Rule 4)
export default function AdminDistributeYieldPage() {
  const params = useParams()
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  
  const [property, setProperty] = useState<Property | null>(null)
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null)
  const [distributionHistory, setDistributionHistory] = useState<DistributionHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [yieldAmount, setYieldAmount] = useState('')
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [txState, setTxState] = useState<'idle' | 'approving' | 'depositing' | 'success' | 'error'>('idle')
  const [txError, setTxError] = useState<string | null>(null)
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null)

  const { writeContract: writeApproval, data: approvalHash, error: approvalError } = useWriteContract()
  const { writeContract: writeDeposit, data: depositHash, error: depositError } = useWriteContract()
  
  const { isLoading: isApprovalPending } = useWaitForTransactionReceipt({
    hash: approvalHash,
  })
  
  const { isLoading: isDepositPending } = useWaitForTransactionReceipt({
    hash: depositHash,
  })

  // fix: load property and yield distributor data (Cursor Rule 4)
  useEffect(() => {
    const loadPropertyData = async () => {
      try {
        const propertyId = params.id as string
        
        // fix: fetch property details (Cursor Rule 4)
        if (!supabase) {
          setError('Database not configured')
          return
        }
        
        const { data: propertyData, error: propertyError } = await supabase
          .from('properties')
          .select('id, name, status, total_shares, price_per_token')
          .eq('id', propertyId)
          .single()

        if (propertyError || !propertyData) {
          setError('Property not found')
          return
        }

        setProperty(propertyData)

        // fix: fetch token contract details (Cursor Rule 4)
        const { data: tokenData, error: tokenError } = await supabase
          .from('property_token_details')
          .select(`
            yield_distributor_address,
            contract_address,
            rental_wallet_address,
            token_name,
            token_symbol
          `)
          .eq('property_id', propertyId)
          .single()

        if (tokenError || !tokenData?.yield_distributor_address) {
          setError('YieldDistributor contract not deployed for this property. Please deploy the token contracts first.')
          return
        }

        setTokenDetails(tokenData)

        // fix: fetch distribution history (Cursor Rule 4)
        const { data: historyData, error: historyError } = await supabase
          .from('rental_distributions')
          .select('id, usdc_amount, tx_hash, distributed_at')
          .eq('property_id', propertyId)
          .order('distributed_at', { ascending: false })

        if (!historyError && historyData) {
          setDistributionHistory(historyData)
        }

      } catch (err) {
        setError('Failed to load property data')
        console.error('Error loading property data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadPropertyData()
  }, [params.id])

  // fix: handle rental wallet approval via API (Cursor Rule 4)
  const handleApproveRentalWallet = async () => {
    if (!property?.id) return

    setIsApproving(true)
    setApprovalSuccess(null)

    try {
      const response = await fetch('/api/admin/approve-rental-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property.id
        })
      })

      const result = await response.json()

      if (result.success) {
        setApprovalSuccess(result.transaction_hash)
        console.log('✅ Rental wallet approval successful:', result)
      } else {
        setTxError(result.error || 'Approval failed')
        console.error('❌ Rental wallet approval failed:', result)
      }
    } catch (error) {
      setTxError('Failed to approve rental wallet')
      console.error('❌ Approval error:', error)
    } finally {
      setIsApproving(false)
    }
  }

  // fix: handle pull and distribute yield in one transaction (Cursor Rule 4)
  const handlePullAndDistribute = async () => {
    if (!tokenDetails || !yieldAmount) return

    console.log('🚀 [DistributeYield] Starting pullAndDistribute transaction')
    console.log('📋 Contract details:', {
      yieldDistributorAddress: tokenDetails.yield_distributor_address,
      rentalWalletAddress: tokenDetails.rental_wallet_address,
      contractAddress: tokenDetails.contract_address,
      propertyId: property?.id,
      amount: yieldAmount
    })

    try {
      setTxState('depositing')
      setTxError(null)
      
      const amountWei = parseUnits(yieldAmount, 6) // USDC has 6 decimals
      console.log('💰 Amount in wei:', amountWei.toString())
      
      console.log('📞 Calling pullAndDistribute with:', {
        address: tokenDetails.yield_distributor_address,
        functionName: 'pullAndDistribute',
        args: [amountWei]
      })
      
      const result = writeDeposit({
        address: tokenDetails.yield_distributor_address as `0x${string}`,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'pullAndDistribute',
        args: [amountWei],
      })
      
      console.log('📝 [DistributeYield] Write result:', result)
    } catch (err) {
      setTxError('Failed to pull and distribute yield')
      setTxState('error')
      console.error('❌ Pull and distribute error:', err)
    }
  }

  // fix: monitor transaction state and update database (Cursor Rule 4)
  useEffect(() => {
    console.log('🔄 [DistributeYield] Transaction state update:', {
      depositHash,
      isDepositPending,
      txState,
      depositError
    })
    
    if (depositHash && !isDepositPending && txState === 'depositing') {
      console.log('✅ [DistributeYield] Transaction successful, updating database...')
      // Pull and distribute successful, update database
      updateDistributionRecord(depositHash)
    }
    
    if (depositError) {
      console.error('❌ [DistributeYield] Transaction failed:', depositError)
      setTxError(`Transaction failed: ${depositError.message || 'Unknown error'}`)
      setTxState('error')
    }
  }, [depositHash, isDepositPending, txState, depositError])

  // fix: update Supabase with successful yield distribution (Cursor Rule 4)
  const updateDistributionRecord = async (txHash: string) => {
    try {
      const response = await fetch('/api/admin/distribute-yield', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: property?.id,
          usdc_amount: yieldAmount,
          tx_hash: txHash,
        }),
      })

      if (response.ok) {
        setTxState('success')
        setSuccessTxHash(txHash)
        setYieldAmount('')
        setIsConfirmModalOpen(false)
        
        // Refresh distribution history
        if (supabase) {
          const { data: historyData } = await supabase
            .from('rental_distributions')
            .select('id, usdc_amount, tx_hash, distributed_at')
            .eq('property_id', property?.id)
            .order('distributed_at', { ascending: false })

          if (historyData) {
            setDistributionHistory(historyData)
          }
        }
      } else {
        setTxError('Failed to record distribution in database')
        setTxState('error')
      }
    } catch (err) {
      setTxError('Failed to update distribution record')
      setTxState('error')
      console.error('Database update error:', err)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getBaseScanUrl = (txHash: string) => {
    const baseUrl = chainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org'
    return `${baseUrl}/tx/${txHash}`
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Distribute Yield</h1>
          <p className="text-openhouse-fg-muted">{property?.name}</p>
        </div>
      </div>

      {/* Property Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-openhouse-accent" />
            Property Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-openhouse-fg-muted">Status</p>
              <Badge variant={property?.status === 'completed' ? 'default' : 'secondary'}>
                {property?.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-openhouse-fg-muted">Total Shares</p>
              <p className="font-semibold">{property?.total_shares.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-openhouse-fg-muted">Price per Token</p>
              <p className="font-semibold">{formatCurrency(property?.price_per_token || 0)}</p>
            </div>
          </div>
          
          {tokenDetails && (
            <div className="pt-4 border-t space-y-3">
              <div>
                <p className="text-sm text-openhouse-fg-muted mb-2">YieldDistributor Contract</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-openhouse-bg-muted px-2 py-1 rounded">
                    {tokenDetails.yield_distributor_address}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(getBaseScanUrl(tokenDetails.yield_distributor_address), '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* Rental Wallet Approval Section */}
              <div>
                <p className="text-sm text-openhouse-fg-muted mb-2">Rental Wallet Setup</p>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleApproveRentalWallet}
                    disabled={isApproving}
                    variant="outline"
                    size="sm"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      'Approve Rental Wallet'
                    )}
                  </Button>
                  {approvalSuccess && (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-openhouse-success" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`https://sepolia.basescan.org/tx/${approvalSuccess}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-openhouse-fg-muted mt-1">
                  This allows the YieldDistributor to pull USDC from the rental wallet
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yield Distribution Form */}
      <Card>
        <CardHeader>
          <CardTitle>Deposit Rental Yield</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Connect your admin wallet to deposit yield
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">USDC Amount</label>
                <Input
                  type="number"
                  value={yieldAmount}
                  onChange={(e) => setYieldAmount(e.target.value)}
                  placeholder="Enter USDC amount to distribute"
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-openhouse-fg-muted">
                  This amount will be distributed proportionally to all token holders
                </p>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Important Notice</p>
                    <ul className="space-y-1 text-xs">
                      <li>• This will pull USDC from the rental wallet automatically</li>
                      <li>• Takes a snapshot of current token balances</li>
                      <li>• Users must claim their yield manually</li>
                      <li>• Transaction is processed in one step</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={!yieldAmount || parseFloat(yieldAmount) <= 0 || txState !== 'idle'}
                className="w-full"
              >
                {txState === 'idle' ? 'Distribute Yield' : 'Processing...'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Distribution History */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution History</CardTitle>
        </CardHeader>
        <CardContent>
          {distributionHistory.length === 0 ? (
            <p className="text-openhouse-fg-muted text-center py-8">
              No yield distributions yet
            </p>
          ) : (
            <div className="space-y-3">
              {distributionHistory.map((distribution) => (
                <div
                  key={distribution.id}
                  className="flex items-center justify-between p-3 bg-openhouse-bg-muted rounded-lg"
                >
                  <div>
                    <p className="font-medium">{formatCurrency(distribution.usdc_amount)}</p>
                    <p className="text-sm text-openhouse-fg-muted">
                      {formatDate(distribution.distributed_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(getBaseScanUrl(distribution.tx_hash), '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Yield Distribution</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-openhouse-bg-muted rounded-lg">
              <p className="text-sm text-openhouse-fg-muted mb-2">Distribution Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Property:</span>
                  <span className="font-medium">{property?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">{formatCurrency(parseFloat(yieldAmount || '0'))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Shares:</span>
                  <span className="font-medium">{property?.total_shares.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {txState === 'error' && txError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{txError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={txState === 'approving' || txState === 'depositing'}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePullAndDistribute}
                disabled={txState === 'depositing'}
                className="flex-1"
              >
                {txState === 'idle' && 'Confirm & Distribute'}
                {txState === 'depositing' && (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Distributing...
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={txState === 'success'} onOpenChange={() => setTxState('idle')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Yield Distributed Successfully
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-openhouse-fg-muted">
              {formatCurrency(parseFloat(yieldAmount || '0'))} has been successfully deposited 
              for distribution to {property?.name} token holders.
            </p>

            {successTxHash && (
              <Button
                variant="outline"
                onClick={() => window.open(getBaseScanUrl(successTxHash), '_blank')}
                className="w-full"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Transaction
              </Button>
            )}

            <Button
              onClick={() => setTxState('idle')}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}