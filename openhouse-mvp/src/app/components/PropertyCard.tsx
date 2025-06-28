import React, { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Calendar, DollarSign, Coins, PiggyBank } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import type { PropertyWithProgress } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { useAccount, useChainId } from 'wagmi'
import { getYieldDistributionInfo } from '@/lib/contracts'

interface PropertyCardProps {
  property: PropertyWithProgress
}

// fix: interface for completed property stats (Cursor Rule 4)
interface CompletedPropertyStats {
  pricePerToken: number
  rentalIncomeToDate: number
  estimatedAPY: number | null
  userHoldings: number
  lastTradePrice?: number
}

export function PropertyCard({ property }: PropertyCardProps) {
  const {
    id,
    name,
    image_url,
    video_thumbnail,
    price_per_token,
    funding_deadline,
    status,
    raised_amount,
    funding_goal_usdc,
    progress_percentage,
    total_shares
  } = property



  const [completedStats, setCompletedStats] = useState<CompletedPropertyStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [propertyFinancials, setPropertyFinancials] = useState<any>(null)
  const [availableShares, setAvailableShares] = useState<number | null>(null)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const statusColors = {
    active: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    funded: 'bg-openhouse-accent/10 text-openhouse-accent border-openhouse-accent/20',
    completed: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    live: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    draft: 'bg-openhouse-warning/10 text-openhouse-warning border-openhouse-warning/20'
  }

  const fetchCompletedPropertyStats = useCallback(async () => {
    if (!supabase) return
    
    console.log(`[PropertyCard] Fetching stats for property ${id}, status: ${status}`)
    setIsLoadingStats(true)
    try {
      // fix: fetch property token details with contract addresses (Cursor Rule 4)
      const { data: tokenDetails, error: tokenError } = await supabase
        .from('property_token_details')
        .select('*')
        .eq('property_id', id)
        .single()

      if (tokenError) {
        console.error('Failed to fetch token details:', tokenError)
        return
      }

      console.log(`[PropertyCard] Token details:`, tokenDetails)

      const stats: CompletedPropertyStats = {
        pricePerToken: price_per_token, // fallback to initial price
        rentalIncomeToDate: 0,
        estimatedAPY: null,
        userHoldings: 0
      }

      // fix: get last trade price from transactions table (Cursor Rule 4)
      // Note: transactions table doesn't have price_per_token column, use executed_price_usdc instead
      const { data: lastTrade } = await supabase
        .from('transactions')
        .select('executed_price_usdc')
        .eq('property_id', id)
        .in('type', ['sell', 'buy']) // use 'type' column instead of 'transaction_type'
        .not('executed_price_usdc', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastTrade?.executed_price_usdc) {
        stats.pricePerToken = lastTrade.executed_price_usdc
        stats.lastTradePrice = lastTrade.executed_price_usdc
      }

      // fix: get rental income from yield distributor contract if available (Cursor Rule 4)
      if (tokenDetails.yield_distributor_address && address) {
        console.log(`[PropertyCard] Fetching yield data from: ${tokenDetails.yield_distributor_address}, chainId: ${chainId}, user: ${address}`)
        try {
          // fix: use actual chain ID from wagmi hook (Cursor Rule 4)
          const yieldInfo = await getYieldDistributionInfo(
            chainId,
            tokenDetails.yield_distributor_address as `0x${string}`,
            address as `0x${string}`
          )

          console.log(`[PropertyCard] Yield info received:`, yieldInfo)
          
          if (yieldInfo) {
            // fix: convert bigint to number for display (Cursor Rule 4)
            stats.rentalIncomeToDate = Number(yieldInfo.totalDistributed) / 1e6 // USDC has 6 decimals
            
            // fix: calculate APY based on latest yield round if multiple rounds exist (Cursor Rule 4)
            if (yieldInfo.currentRound > BigInt(0) && stats.rentalIncomeToDate > 0) {
              // fix: get latest distribution round for more accurate APY calculation (Cursor Rule 4)
              if (yieldInfo.currentRound > BigInt(1)) {
                // If multiple rounds, estimate APY based on recent yield
                const estimatedAnnualYield = (stats.rentalIncomeToDate / Number(yieldInfo.currentRound)) * 12
                stats.estimatedAPY = (estimatedAnnualYield / stats.pricePerToken) * 100
              } else {
                // For single round, use simple annualized calculation
                const estimatedAnnualYield = stats.rentalIncomeToDate * 12
                stats.estimatedAPY = (estimatedAnnualYield / stats.pricePerToken) * 100
              }
              
              // fix: cap APY at reasonable maximum to avoid display issues (Cursor Rule 4)
              if (stats.estimatedAPY > 999) {
                stats.estimatedAPY = null // Don't show unrealistic APY
              }
            }
          }
        } catch (yieldError) {
          console.error('[PropertyCard] Failed to fetch yield data:', yieldError)
        }
      } else {
        console.log(`[PropertyCard] Skipping yield fetch - yield_distributor_address: ${tokenDetails.yield_distributor_address}, address: ${address}`)
      }

      // fix: get user holdings if wallet is connected (Cursor Rule 4)
      if (isConnected && address) {
        // fix: first get user UUID from wallet address (Cursor Rule 4)
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('wallet_address', address.toLowerCase())
          .single()

        if (userData) {
          const { data: userHolding } = await supabase
            .from('user_holdings')
            .select('shares')
            .eq('property_id', id)
            .eq('user_id', userData.id)
            .single()

          if (userHolding?.shares) {
            stats.userHoldings = userHolding.shares
          }
        }
      }

      console.log(`[PropertyCard] Final stats:`, stats)
      setCompletedStats(stats)

    } catch (error) {
      console.error('[PropertyCard] Failed to fetch completed property stats:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }, [id, status, address, isConnected, price_per_token, chainId])

  // fix: fetch property financials for all properties (Cursor Rule 4)
  const fetchPropertyFinancials = useCallback(async () => {
    if (!supabase) return
    
    try {
      const { data, error } = await supabase
        .from('property_financials')
        .select('annual_yield_pct')
        .eq('property_id', id)
        .single()

      if (!error && data) {
        setPropertyFinancials(data)
      }
    } catch (error) {
      console.error('Failed to fetch property financials:', error)
    }
  }, [id])

  // fix: fetch available shares for live properties (Cursor Rule 4)
  const fetchAvailableShares = useCallback(async () => {
    if (!supabase) return
    
    try {
      const { data, error } = await supabase
        .from('property_token_details')
        .select('available_shares')
        .eq('property_id', id)
        .single()

      if (!error && data && data.available_shares !== null) {
        setAvailableShares(data.available_shares)
      } else {
        // Fallback to total_shares if no token details yet
        setAvailableShares(total_shares)
      }
    } catch (error) {
      console.error('Failed to fetch available shares:', error)
      setAvailableShares(total_shares)
    }
  }, [id, total_shares])

  // fix: fetch completed property stats from database and contracts (Cursor Rule 4)
  useEffect(() => {
    fetchPropertyFinancials()
    fetchAvailableShares()
    
    if (status === 'completed' || status === 'live') {
      fetchCompletedPropertyStats()
    }
  }, [status, fetchCompletedPropertyStats, fetchPropertyFinancials, fetchAvailableShares])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDeadline = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return 'Invalid date'
    }
  }

  // fix: render completed property stats (Cursor Rule 4)
  const renderCompletedStats = () => {
    if (isLoadingStats || !completedStats) {
      return (
        <CardContent className="pt-0 space-y-3 py-0">
          {/* Three-column data layout */}
          <div className="grid grid-cols-3 gap-4 items-center justify-center p-3 bg-openhouse-bg-muted rounded-md">
            <div className="text-center">
              <p className="text-sm text-openhouse-fg-muted">Available</p>
              <p className="font-semibold text-openhouse-fg">
                {availableShares !== null ? availableShares : total_shares}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-openhouse-fg-muted">Price</p>
              <p className="font-semibold text-openhouse-fg">
                {formatCurrency(price_per_token)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-openhouse-fg-muted">Annual Yield</p>
              <p className="font-semibold text-openhouse-fg">
                {propertyFinancials?.annual_yield_pct ? `${propertyFinancials.annual_yield_pct.toFixed(1)}%` : 'TBD'}
              </p>
            </div>
          </div>
        </CardContent>
      )
    }

    return (
      <CardContent className="pt-0 space-y-3 py-0">
        {/* Three-column data layout */}
        <div className="grid grid-cols-3 gap-4 items-start justify-start">
          <div className="text-left">
            <p className="text-sm text-openhouse-fg-muted">Available</p>
            <p className="font-semibold text-openhouse-fg">
              {availableShares !== null ? availableShares : total_shares}
            </p>
          </div>
          <div className="text-left">
            <p className="text-sm text-openhouse-fg-muted">Price</p>
            <p className="font-semibold text-openhouse-fg">
              {formatCurrency(completedStats.pricePerToken)}
              {completedStats.lastTradePrice && completedStats.lastTradePrice !== price_per_token && (
                <span className="text-xs text-openhouse-fg-muted block">
                  (Last traded)
                </span>
              )}
            </p>
          </div>
          <div className="text-left">
            <p className="text-sm text-openhouse-fg-muted">Annual Yield</p>
            <p className="font-semibold text-openhouse-fg">
              {completedStats.estimatedAPY !== null 
                ? `${completedStats.estimatedAPY.toFixed(1)}%` 
                : propertyFinancials?.annual_yield_pct 
                  ? `${propertyFinancials.annual_yield_pct.toFixed(1)}%` 
                  : 'TBD'
              }
            </p>
          </div>
        </div>
      </CardContent>
    )
  }

  // fix: render crowdfunding stats for non-completed properties (Cursor Rule 4)
  const renderCrowdfundingStats = () => (
    <CardContent className="pt-0 space-y-3 py-0">
      {/* Three-column data layout */}
      <div className="grid grid-cols-3 gap-2 items-start justify-start p-3 bg-openhouse-bg-muted rounded-sm">
        <div className="text-left">
          <p className="text-sm text-openhouse-fg-muted">Available</p>
          <p className="font-semibold text-openhouse-fg">
            {availableShares !== null ? availableShares : total_shares}
          </p>
        </div>
        <div className="text-left">
          <p className="text-sm text-openhouse-fg-muted">Price</p>
          <p className="font-semibold text-openhouse-fg">
            {formatCurrency(price_per_token)}
          </p>
        </div>
        <div className="text-left">
          <p className="text-sm text-openhouse-fg-muted">Annual Yield</p>
          <p className="font-semibold text-openhouse-fg">
            {propertyFinancials?.annual_yield_pct ? `${propertyFinancials.annual_yield_pct.toFixed(1)}%` : 'TBD'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-openhouse-fg-muted">
          <div className="text-sm text-openhouse-fg-muted">
            <span className="font-semibold text-openhouse-fg">{formatCurrency(raised_amount)}</span> <span className="text-openhouse-fg-muted">of {formatCurrency(funding_goal_usdc)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-openhouse-fg-muted">
            <span>Ends {formatDeadline(funding_deadline)}</span>
          </div>
        </div>
        <div className="w-full bg-openhouse-bg-muted rounded-full h-2">
          <div 
            className="bg-openhouse-success h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(progress_percentage, 100)}%` }}
          />
        </div>
      </div>
    </CardContent>
  )

  return (
    <Card className="group h-full overflow-hidden bg-card rounded-sm transition-all duration-200 p-2 border border-openhouse-border rounded-md">
      <Link href={`/properties/${id}`} className="block h-full">
        <div className="aspect-[1/1] relative overflow-hidden bg-openhouse-bg-muted">
          {/* fix: use dynamic video_thumbnail from Supabase for property showcase (Cursor Rule 4) */}
          {video_thumbnail ? (
            <video
              className="absolute inset-0 w-full h-full object-cover rounded-sm"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={image_url || undefined}
            >
              <source 
                src={video_thumbnail} 
                type="video/mp4" 
              />
              {/* Fallback to image if video fails to load */}
              {image_url ? (
                <Image
                  src={image_url}
                  alt={name}
                  fill
                  className="object-cover rounded-sm"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-openhouse-bg-muted to-openhouse-bg">
                  <div className="w-16 h-16 rounded-lg bg-openhouse-accent/10 flex items-center justify-center">
                    <DollarSign className="w-8 h-8 text-openhouse-accent" />
                  </div>
                </div>
              )}
            </video>
          ) : image_url ? (
            <Image
              src={image_url}
              alt={name}
              fill
              className="object-cover rounded-sm"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-openhouse-bg-muted to-openhouse-bg">
              <div className="w-16 h-16 rounded-lg bg-openhouse-accent/10 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-openhouse-accent" />
              </div>
            </div>
          )}
          
          <div className="absolute top-3 right-3">
            <Badge variant="card">
              {status === 'completed' || status === 'live' ? 'Live' : status}
            </Badge>
          </div>
        </div>

        <CardHeader className="px-3 pt-3 pb-2">
          <h3 className="font-title font-medium text-lg font-medium text-openhouse-fg group-hover:text-openhouse-accent text-left transition-colors line-clamp-2">
            {name}
          </h3>
        </CardHeader>

        {/* fix: conditionally render stats based on property status (Cursor Rule 4) */}
        {(status === 'completed' || status === 'live') ? renderCompletedStats() : renderCrowdfundingStats()}
      </Link>
    </Card>
  )
} 