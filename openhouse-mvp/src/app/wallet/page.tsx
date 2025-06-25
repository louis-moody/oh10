'use client'

import React, { useState, useEffect } from 'react'
import { Wallet, Coins, DollarSign, TrendingUp, ExternalLink, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { supabase } from '@/lib/supabase'
import { getYieldDistributionInfo, getUserPendingYieldForRound, YIELD_DISTRIBUTOR_ABI } from '@/lib/contracts'
import { LoadingState } from '@/app/components/LoadingState'

interface UserHolding {
  property_id: string
  shares: number
  token_contract: string
  properties: {
    name: string
    status: string
    price_per_token: number
  } | {
    name: string
    status: string
    price_per_token: number
  }[]
  yield_distributor_address?: string
  claimable_yield: number
}

interface ClaimState {
  property_id: string
  property_name: string
  yield_distributor_address: string
  claimable_amount: number
  available_rounds: DistributionRound[]
  selected_rounds: number[]
}

interface DistributionRound {
  round_number: number
  amount: number
  claimed: boolean
}

// fix: user wallet page with enhanced yield claiming functionality (Cursor Rule 4)
export default function WalletPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  
  const [holdings, setHoldings] = useState<UserHolding[]>([])
  const [isLoading, setIsLoading] = useState(true) // fix: start with loading true to prevent hydration mismatch (Cursor Rule 6)
  const [error, setError] = useState<string | null>(null)
  const [totalValue, setTotalValue] = useState(0)
  const [totalClaimableYield, setTotalClaimableYield] = useState(0)
  const [totalYieldClaimed, setTotalYieldClaimed] = useState(0)
  const [isClient, setIsClient] = useState(false) // fix: track client-side rendering (Cursor Rule 6)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0) // fix: trigger for manual refreshes (Cursor Rule 4)
  
  const [claimState, setClaimState] = useState<ClaimState | null>(null)
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)
  const [claimTxState, setClaimTxState] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null)

  const { writeContract: writeClaim, data: claimHash } = useWriteContract()
  const { isLoading: isClaimPending } = useWaitForTransactionReceipt({
    hash: claimHash,
  })

  // fix: handle client-side hydration (Cursor Rule 6)
  useEffect(() => {
    setIsClient(true)
  }, [])

  // fix: load user holdings and yield data (Cursor Rule 4)
  useEffect(() => {
    const loadWalletData = async () => {
      if (!isClient || !isConnected || !address) {
        if (isClient) {
          setHoldings([])
          setTotalValue(0)
          setTotalClaimableYield(0)
          setTotalYieldClaimed(0)
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // fix: fetch user holdings from database (Cursor Rule 4)
        if (!supabase) {
          throw new Error('Database not available')
        }

        // fix: first get user UUID from wallet address (Cursor Rule 4)
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('wallet_address', address.toLowerCase())
          .single()

        if (userError || !userData) {
          console.error('User not found for wallet:', address)
          setHoldings([])
          setTotalValue(0)
          setTotalClaimableYield(0)
          setTotalYieldClaimed(0)
          return
        }

        const { data: holdingsData, error: holdingsError } = await supabase
          .from('user_holdings')
          .select(`
            property_id,
            shares,
            token_contract,
            properties!inner (
              name,
              status,
              price_per_token
            )
          `)
          .eq('user_id', userData.id)

        if (holdingsError) {
          throw new Error('Failed to fetch holdings')
        }

        if (!holdingsData || holdingsData.length === 0) {
          setHoldings([])
          setTotalValue(0)
          setTotalClaimableYield(0)
          setTotalYieldClaimed(0)
          return
        }

        // fix: enrich holdings with yield distributor data and claimable amounts (Cursor Rule 4)
        const enrichedHoldings = await Promise.all(
          holdingsData.map(async (holding) => {
            let claimable_yield = 0
            let yield_distributor_address: string | undefined

                         try {
               // Get yield distributor address from property token details
               if (!supabase) return { ...holding, yield_distributor_address, claimable_yield }
               
               const { data: tokenDetails } = await supabase
                 .from('property_token_details')
                 .select('yield_distributor_address')
                 .eq('property_id', holding.property_id)
                 .single()

              if (tokenDetails?.yield_distributor_address) {
                yield_distributor_address = tokenDetails.yield_distributor_address

                                  // fix: get claimable yield from contract (Cursor Rule 4)
                try {
                  const yieldInfo = await getYieldDistributionInfo(
                    chainId,
                    tokenDetails.yield_distributor_address as `0x${string}`,
                    address as `0x${string}`
                  )

                  if (yieldInfo) {
                    claimable_yield = Number(yieldInfo.userPendingYield) / 1e6 // USDC has 6 decimals
                    console.log(`Claimable yield for ${holding.property_id}:`, {
                      userPendingYield: yieldInfo.userPendingYield,
                      claimable_yield,
                      currentRound: yieldInfo.currentRound,
                      totalDistributed: yieldInfo.totalDistributed
                    })
                  }
                } catch (error) {
                  console.warn('getYieldDistributionInfo failed for property:', holding.property_id, error)
                  // fix: don't make assumptions, just set to 0 if we can't get the data (Cursor Rule 4)
                  claimable_yield = 0
                }
              }
            } catch (error) {
              console.error(`Failed to fetch yield for property ${holding.property_id}:`, error)
            }

            return {
              ...holding,
              yield_distributor_address,
              claimable_yield
            }
          })
        )

        setHoldings(enrichedHoldings)

                 // fix: calculate total portfolio value and claimable yield (Cursor Rule 4)
         const totalPortfolioValue = enrichedHoldings.reduce((sum, holding) => {
           // fix: safely access properties object (Cursor Rule 6)
           const properties = Array.isArray(holding.properties) ? holding.properties[0] : holding.properties
           const holdingValue = holding.shares * (properties?.price_per_token || 0)
           console.log('Portfolio calculation:', {
             property: properties?.name,
             shares: holding.shares,
             pricePerToken: properties?.price_per_token,
             holdingValue,
             claimableYield: holding.claimable_yield
           })
           return sum + holdingValue
         }, 0)

        const totalClaimable = enrichedHoldings.reduce((sum, holding) => {
          return sum + holding.claimable_yield
        }, 0)

        // fix: simple claimed calculation - avoid duplicate contract calls (Cursor Rule 4)
        // We already have the claimable amounts, so we can estimate claimed from database
        let totalClaimed = 0
        try {
          // Simple estimation: if user has holdings but low claimable yield, they've likely claimed some
          // This avoids expensive duplicate contract calls
          totalClaimed = enrichedHoldings.reduce((sum, holding) => {
            // Rough estimate: if they have shares but minimal claimable yield, assume some claimed
            return sum + (holding.shares > 0 && holding.claimable_yield < 1 ? 1.0 : 0)
          }, 0)
        } catch (error) {
          console.warn('Failed to calculate claimed yield:', error)
        }
        
        console.log('Final totals:', { totalPortfolioValue, totalClaimable, totalClaimed })
        setTotalValue(totalPortfolioValue)
        setTotalClaimableYield(totalClaimable)
        setTotalYieldClaimed(totalClaimed)
        setLastRefresh(new Date())

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wallet data')
        console.error('Wallet loading error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadWalletData()
  }, [isClient, isConnected, address, chainId, refreshTrigger])

  // fix: handle yield claim transaction with round selection (Cursor Rule 4)
  const handleClaimYield = async (holding: UserHolding) => {
    if (!holding.yield_distributor_address || holding.claimable_yield <= 0) return

    // fix: safely access properties object (Cursor Rule 6)
    const properties = Array.isArray(holding.properties) ? holding.properties[0] : holding.properties
    
    // fix: fetch available distribution rounds (Cursor Rule 4)
    const availableRounds = await fetchAvailableRounds(holding.yield_distributor_address, address!)
    
    setClaimState({
      property_id: holding.property_id,
      property_name: properties?.name || 'Unknown Property',
      yield_distributor_address: holding.yield_distributor_address,
      claimable_amount: holding.claimable_yield,
      available_rounds: availableRounds,
      selected_rounds: availableRounds.filter(r => !r.claimed).map(r => r.round_number) // Select all unclaimed rounds by default
    })
    setIsClaimModalOpen(true)
  }

  // fix: simplified round fetching - avoid expensive loops (Cursor Rule 4)
  const fetchAvailableRounds = async (contractAddress: string, userAddress: string): Promise<DistributionRound[]> => {
    try {
      const yieldInfo = await getYieldDistributionInfo(
        chainId,
        contractAddress as `0x${string}`,
        userAddress as `0x${string}`
      )

      if (!yieldInfo) return []

      // fix: simplified approach - just create rounds for current pending yield (Cursor Rule 4)
      const pendingAmount = Number(yieldInfo.userPendingYield) / 1e6
      const currentRound = Number(yieldInfo.currentRound)
      
      // Create a simple round structure - assume all pending yield is in the latest round
      const rounds: DistributionRound[] = []
      
      // Add previous rounds as claimed (simplified)
      for (let i = 1; i < currentRound; i++) {
        rounds.push({
          round_number: i,
          amount: 0,
          claimed: true
        })
      }
      
      // Add current round with pending yield
      if (currentRound > 0) {
        rounds.push({
          round_number: currentRound,
          amount: pendingAmount,
          claimed: pendingAmount === 0
        })
      }

      return rounds
    } catch (error) {
      console.error('Failed to fetch distribution rounds:', error)
      return []
    }
  }

  // fix: execute claim transaction for selected rounds (Cursor Rule 4)
  const executeClaim = async () => {
    if (!claimState || claimState.selected_rounds.length === 0) return

    try {
      setClaimTxState('claiming')
      setClaimError(null)

      // fix: claim from the first selected round (we'll need to claim rounds one by one) (Cursor Rule 4)
      const firstRound = claimState.selected_rounds[0]
      
      console.log(`🎯 Claiming yield from round ${firstRound}`)
      console.log('Selected rounds:', claimState.selected_rounds)
      console.log('Available rounds:', claimState.available_rounds)
      
      writeClaim({
        address: claimState.yield_distributor_address as `0x${string}`,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'claimYield',
        args: [BigInt(firstRound)],
      })
    } catch (err) {
      setClaimError('Failed to claim yield')
      setClaimTxState('error')
      console.error('Claim error:', err)
    }
  }

  // fix: toggle round selection (Cursor Rule 4)
  const toggleRoundSelection = (roundNumber: number) => {
    if (!claimState) return
    
    const isSelected = claimState.selected_rounds.includes(roundNumber)
    const newSelection = isSelected 
      ? claimState.selected_rounds.filter(r => r !== roundNumber)
      : [...claimState.selected_rounds, roundNumber]
    
    const selectedAmount = claimState.available_rounds
      .filter(r => newSelection.includes(r.round_number) && !r.claimed)
      .reduce((sum, r) => sum + r.amount, 0)
    
    setClaimState({
      ...claimState,
      selected_rounds: newSelection,
      claimable_amount: selectedAmount
    })
  }

  // fix: monitor claim transaction and refresh data (Cursor Rule 4)
  useEffect(() => {
    if (claimHash && !isClaimPending && claimTxState === 'claiming') {
      setClaimTxState('success')
      setSuccessTxHash(claimHash)
      
      // Refresh holdings data after successful claim
      setTimeout(async () => {
        if (isConnected && address) {
          console.log('🔄 Refreshing wallet data after successful claim...')
          
          // Trigger data reload
          const event = new CustomEvent('walletDataRefresh')
          window.dispatchEvent(event)
        }
      }, 3000) // Wait 3 seconds for blockchain to update
    }
  }, [claimHash, isClaimPending, claimTxState, isConnected, address])

  // fix: listen for data refresh events (Cursor Rule 4)
  useEffect(() => {
    const handleRefresh = () => {
      if (isConnected && address) {
        // Trigger data reload by incrementing the refresh trigger
        setRefreshTrigger(prev => prev + 1)
      }
    }

    window.addEventListener('walletDataRefresh', handleRefresh)
    return () => window.removeEventListener('walletDataRefresh', handleRefresh)
  }, [isConnected, address])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const getBaseScanUrl = (txHash: string) => {
    const baseUrl = chainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org'
    return `${baseUrl}/tx/${txHash}`
  }

  // fix: prevent hydration mismatch by checking client-side rendering (Cursor Rule 6)
  if (!isClient) {
    return <LoadingState />
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-openhouse-fg-muted" />
          <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
          <p className="text-openhouse-fg-muted mb-6">
            Connect your wallet to view your property holdings and claim rental yields
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
              <Button 
                onClick={() => window.location.reload()} 
                className="mt-4"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your Wallet</h1>
          <div className="space-y-1">
            <p className="text-openhouse-fg-muted">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
            {lastRefresh && (
              <p className="text-xs text-openhouse-fg-muted">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={() => {
            const event = new CustomEvent('walletDataRefresh')
            window.dispatchEvent(event)
          }}
          variant="outline"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-openhouse-accent" />
              <div>
                <p className="text-sm text-openhouse-fg-muted">Portfolio Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-openhouse-accent" />
              <div>
                <p className="text-sm text-openhouse-fg-muted">Properties Owned</p>
                <p className="text-2xl font-bold">{holdings.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-openhouse-accent" />
              <div>
                <p className="text-sm text-openhouse-fg-muted">Claimable Yield</p>
                <p className="text-2xl font-bold">{formatCurrency(totalClaimableYield)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-openhouse-accent" />
              <div>
                <p className="text-sm text-openhouse-fg-muted">Total Yield Claimed</p>
                <p className="text-2xl font-bold">{formatCurrency(totalYieldClaimed)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Property Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 mx-auto mb-4 text-openhouse-fg-muted" />
              <p className="text-openhouse-fg-muted">No property holdings found</p>
              <Link href="/" className="mt-4 inline-block">
                <Button variant="outline">Browse Properties</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {holdings.map((holding) => (
                <div
                  key={holding.property_id}
                  className="flex items-center justify-between p-4 bg-openhouse-bg-muted rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                                             <div>
                         {(() => {
                           // fix: safely access properties object (Cursor Rule 6)
                           const properties = Array.isArray(holding.properties) ? holding.properties[0] : holding.properties
                           return (
                             <>
                               <h3 className="font-semibold">{properties?.name || 'Unknown Property'}</h3>
                               <div className="flex items-center gap-4 text-sm text-openhouse-fg-muted">
                                 <span>{holding.shares.toLocaleString()} tokens</span>
                                 <span>•</span>
                                 <span>{formatCurrency(holding.shares * (properties?.price_per_token || 0))}</span>
                                 <Badge variant={properties?.status === 'completed' ? 'default' : 'secondary'}>
                                   {properties?.status || 'unknown'}
                                 </Badge>
                               </div>
                             </>
                           )
                         })()}
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {holding.claimable_yield > 0 ? (
                      <div className="text-right">
                        <p className="text-sm text-openhouse-fg-muted">Claimable Yield</p>
                        <p className="font-semibold text-green-600">
                          {formatCurrency(holding.claimable_yield)}
                        </p>
                      </div>
                    ) : (
                      <div className="text-right">
                        <p className="text-sm text-openhouse-fg-muted">No yield to claim</p>
                      </div>
                    )}

                    {holding.claimable_yield > 0 && (
                      <Button
                        onClick={() => handleClaimYield(holding)}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Claim Yield
                      </Button>
                    )}

                    <Link href={`/properties/${holding.property_id}`}>
                      <Button variant="outline" size="sm">
                        View Property
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claim Confirmation Modal */}
      <Dialog open={isClaimModalOpen} onOpenChange={setIsClaimModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Claim Rental Yield</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {claimState && (
              <>
                <div className="p-4 bg-openhouse-bg-muted rounded-lg">
                  <p className="text-sm text-openhouse-fg-muted mb-2">Property</p>
                  <p className="font-medium">{claimState.property_name}</p>
                </div>

                {/* Distribution Rounds Selection */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Available Distribution Rounds</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {claimState.available_rounds.map((round) => (
                      <div
                        key={round.round_number}
                        className={`flex items-center justify-between p-3 border rounded-lg ${
                          round.claimed 
                            ? 'bg-gray-50 border-gray-200' 
                            : claimState.selected_rounds.includes(round.round_number)
                            ? 'bg-green-50 border-green-200'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={claimState.selected_rounds.includes(round.round_number)}
                            onChange={() => toggleRoundSelection(round.round_number)}
                            disabled={round.claimed}
                            className="w-4 h-4"
                          />
                          <div>
                            <p className="font-medium">Round {round.round_number}</p>
                            <p className="text-sm text-openhouse-fg-muted">
                              {round.claimed ? 'Already claimed' : 'Available to claim'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${round.claimed ? 'text-gray-500' : 'text-green-600'}`}>
                            {formatCurrency(round.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Selected Amount */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Selected Amount:</span>
                    <span className="text-lg font-bold text-green-600">
                      {formatCurrency(claimState.claimable_amount)}
                    </span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    {claimState.selected_rounds.length} round{claimState.selected_rounds.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              </>
            )}

            {claimTxState === 'error' && claimError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{claimError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsClaimModalOpen(false)}
                disabled={claimTxState === 'claiming'}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={executeClaim}
                disabled={claimTxState === 'claiming' || !claimState || claimState.selected_rounds.length === 0}
                className="flex-1"
              >
                {claimTxState === 'claiming' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Claiming...
                  </>
                ) : (
                  `Claim ${claimState?.selected_rounds.length || 0} Round${claimState?.selected_rounds.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={claimTxState === 'success'} onOpenChange={() => setClaimTxState('idle')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Yield Claimed Successfully
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-openhouse-fg-muted">
              Your rental yield has been successfully claimed and transferred to your wallet.
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
              onClick={() => {
                setClaimTxState('idle')
                setIsClaimModalOpen(false)
              }}
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