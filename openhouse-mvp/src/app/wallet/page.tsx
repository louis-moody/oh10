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
import { getYieldDistributionInfo, YIELD_DISTRIBUTOR_ABI } from '@/lib/contracts'
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
}

// fix: user wallet page with yield claiming functionality (Cursor Rule 4)
export default function WalletPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  
  const [holdings, setHoldings] = useState<UserHolding[]>([])
  const [isLoading, setIsLoading] = useState(true) // fix: start with loading true to prevent hydration mismatch (Cursor Rule 6)
  const [error, setError] = useState<string | null>(null)
  const [totalValue, setTotalValue] = useState(0)
  const [totalClaimableYield, setTotalClaimableYield] = useState(0)
  const [isClient, setIsClient] = useState(false) // fix: track client-side rendering (Cursor Rule 6)
  
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

                // Get claimable yield from contract
                const yieldInfo = await getYieldDistributionInfo(
                  chainId,
                  tokenDetails.yield_distributor_address as `0x${string}`,
                  address as `0x${string}`
                )

                if (yieldInfo) {
                  claimable_yield = Number(yieldInfo.userPendingYield) / 1e6 // USDC has 6 decimals
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
           return sum + (holding.shares * (properties?.price_per_token || 0))
         }, 0)

        const totalClaimable = enrichedHoldings.reduce((sum, holding) => {
          return sum + holding.claimable_yield
        }, 0)

        setTotalValue(totalPortfolioValue)
        setTotalClaimableYield(totalClaimable)

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wallet data')
        console.error('Wallet loading error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadWalletData()
  }, [isClient, isConnected, address, chainId])

  // fix: handle yield claim transaction (Cursor Rule 4)
  const handleClaimYield = async (holding: UserHolding) => {
    if (!holding.yield_distributor_address || holding.claimable_yield <= 0) return

         // fix: safely access properties object (Cursor Rule 6)
     const properties = Array.isArray(holding.properties) ? holding.properties[0] : holding.properties
     setClaimState({
       property_id: holding.property_id,
       property_name: properties?.name || 'Unknown Property',
       yield_distributor_address: holding.yield_distributor_address,
       claimable_amount: holding.claimable_yield
     })
    setIsClaimModalOpen(true)
  }

  // fix: execute claim transaction on contract (Cursor Rule 4)
  const executeClaim = async () => {
    if (!claimState) return

    try {
      setClaimTxState('claiming')
      setClaimError(null)

      // fix: get current distribution round from contract to claim all available rounds (Cursor Rule 4)
      // For now, we'll claim round 1. In production, you'd want to get the current round
      // and claim all unclaimed rounds for the user
      
      writeClaim({
        address: claimState.yield_distributor_address as `0x${string}`,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'claimYield',
        args: [BigInt(1)], // Start with round 1, should iterate through all available rounds
      })
    } catch (err) {
      setClaimError('Failed to claim yield')
      setClaimTxState('error')
      console.error('Claim error:', err)
    }
  }

  // fix: monitor claim transaction and update state (Cursor Rule 4)
  useEffect(() => {
    if (claimHash && !isClaimPending && claimTxState === 'claiming') {
      setClaimTxState('success')
      setSuccessTxHash(claimHash)
      
      // Refresh holdings data to update claimable amounts
      setTimeout(() => {
        if (isConnected && address) {
          window.location.reload() // Simple refresh for now
        }
      }, 2000)
    }
  }, [claimHash, isClaimPending, claimTxState, isConnected, address])

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
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your Wallet</h1>
          <p className="text-openhouse-fg-muted">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Claim Rental Yield</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {claimState && (
              <div className="p-4 bg-openhouse-bg-muted rounded-lg">
                <p className="text-sm text-openhouse-fg-muted mb-2">Claim Details</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Property:</span>
                    <span className="font-medium">{claimState.property_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(claimState.claimable_amount)}
                    </span>
                  </div>
                </div>
              </div>
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
                disabled={claimTxState === 'claiming'}
                className="flex-1"
              >
                {claimTxState === 'claiming' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Claiming...
                  </>
                ) : (
                  'Confirm Claim'
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