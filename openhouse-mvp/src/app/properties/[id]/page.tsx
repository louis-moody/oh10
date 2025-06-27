'use client'

import React, { useEffect, useState } from 'react'
import { Building2, ArrowLeft, DollarSign, TrendingUp, Info, Activity, Users, Clock } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase, type Property, type PropertyDetails, type PropertyFinancials, type PropertyActivity, type PropertyTokenDetails } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { ReservationModal } from '@/app/components/ReservationModal'
import { TokenInformationModal } from '@/app/components/TokenInformationModal'
import { TradingModal } from '@/app/components/TradingModal'
import { formatDistanceToNow } from 'date-fns'
import { useAccount } from 'wagmi'

interface PropertyDetailPageProps {
  params: Promise<{
    id: string
  }>
}

type TabType = 'details' | 'financials' | 'activity'

export default function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const [property, setProperty] = useState<Property | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [fundingProgress, setFundingProgress] = useState({ raised_amount: 0, progress_percentage: 0 })
  const [existingReservation, setExistingReservation] = useState<{
    id: string
    usdc_amount: number
    token_amount: number
    payment_status: string
  } | null>(null)
  
  // fix: trading modal and token info states (Cursor Rule 4)
  const [isTokenInfoModalOpen, setIsTokenInfoModalOpen] = useState(false)
  const [isTradingModalOpen, setIsTradingModalOpen] = useState(false)
  const [tokenDetails, setTokenDetails] = useState<PropertyTokenDetails | null>(null)
  
  // fix: tab section states for production page (Cursor Rule 4)
  const [activeTab, setActiveTab] = useState<TabType>('details')
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails | null>(null)
  const [propertyFinancials, setPropertyFinancials] = useState<PropertyFinancials | null>(null)
  const [propertyActivity, setPropertyActivity] = useState<PropertyActivity[]>([])
  
  // fix: live market data states (Cursor Rule 4)
  const [availableShares, setAvailableShares] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [bestBid, setBestBid] = useState<number | null>(null)
  const [bestAsk, setBestAsk] = useState<number | null>(null)
  const [orderBookDepth, setOrderBookDepth] = useState({ sellOrders: 0, buyOrders: 0 })
  
  const { isConnected, address } = useAccount()
  const [propertyId, setPropertyId] = useState<string>('')

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setPropertyId(resolvedParams.id)
      fetchPropertyData(resolvedParams.id)
    }
    getParams()
  }, [params])

  // fix: fetch user reservation when wallet connects (Cursor Rule 4)
  useEffect(() => {
    if (propertyId && address && isConnected) {
      fetchUserReservation(propertyId, address)
    } else if (!isConnected) {
      setExistingReservation(null)
    }
  }, [propertyId, address, isConnected])

  // fix: comprehensive property data fetching (Cursor Rule 4)
  const fetchPropertyData = async (id: string) => {
    try {
      setIsLoading(true)
      setError(null)

      if (!supabase) {
        setError('Database configuration error')
        return
      }

      // fix: fetch basic property details from properties table (Cursor Rule 4)
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single()

      if (propertyError) {
        throw new Error(`Failed to fetch property: ${propertyError.message}`)
      }

      if (!propertyData) {
        setError('Property not found')
        return
      }

      // fix: debug raw database response (Cursor Rule 6)
      console.log('🔍 Raw property data from DB:', propertyData)
      console.log('🔍 All property keys:', Object.keys(propertyData))
      console.log('🔍 video_thumbnail specifically:', {
        value: propertyData.video_thumbnail,
        type: typeof propertyData.video_thumbnail,
        exists: 'video_thumbnail' in propertyData
      })

      setProperty(propertyData)
      
      // fix: debug video_thumbnail field (Cursor Rule 6)
      console.log('🎬 Property data loaded:', {
        id: propertyData.id,
        name: propertyData.name,
        has_image: !!propertyData.image_url,
        has_video: !!propertyData.video_thumbnail,
        video_url: propertyData.video_thumbnail
      })

      // fix: parallel data fetching for performance (Cursor Rule 4)
      await Promise.all([
        fetchTokenDetails(id),
        fetchPropertyDetailsData(id),
        fetchPropertyFinancials(id),
        fetchPropertyActivity(id),
        fetchFundingProgress(id, propertyData.funding_goal_usdc)
      ])

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // fix: fetch token details and market data for live properties (Cursor Rule 4)
  const fetchTokenDetails = async (propertyId: string) => {
    try {
      if (!supabase) return

      const { data: tokenData, error: tokenError } = await supabase
        .from('property_token_details')
        .select('*')
        .eq('property_id', propertyId)
        .single()

      if (!tokenError && tokenData) {
        setTokenDetails(tokenData)
        
        // fix: always fetch market data for completed properties (Cursor Rule 4)
        await fetchMarketData(propertyId)
      }
    } catch (error) {
      console.error('Failed to fetch token details:', error)
    }
  }

  // fix: fetch real market data from order_book table (Cursor Rule 4)
  const fetchMarketData = async (propertyId: string) => {
    try {
      // fix: use market data API for real orderbook data (Cursor Rule 4)
      const response = await fetch(`/api/orderbook/market-data?property_id=${propertyId}`)
      
      if (!response.ok) {
        console.error('Failed to fetch market data:', response.status)
        return
      }

      const marketData = await response.json()
      
      // fix: force state update with explicit values (Cursor Rule 7)
      const sharesValue = marketData.available_shares ?? 0
      const askValue = marketData.best_ask ?? null
      const bidValue = marketData.best_bid ?? null
      
      console.log('🔄 Setting state values:', {
        availableShares: sharesValue,
        bestAsk: askValue,
        bestBid: bidValue,
        orderDepth: marketData.order_depth
      })
      
      setAvailableShares(sharesValue)
      setBestAsk(askValue)
      setBestBid(bidValue)
      setCurrentPrice(askValue || property?.price_per_token || 0)
      setOrderBookDepth({
        sellOrders: marketData.order_depth?.sell_orders || 0,
        buyOrders: marketData.order_depth?.buy_orders || 0
      })

      console.log('✅ State update completed for property:', propertyId)
      
    } catch (error) {
      console.error('Failed to fetch market data:', error)
    }
  }

  // fix: fetch property details from property_details table (Cursor Rule 4)
  const fetchPropertyDetailsData = async (propertyId: string) => {
    try {
      if (!supabase) return

      const { data, error } = await supabase
        .from('property_details')
        .select('*')
        .eq('property_id', propertyId)
        .single()

      if (!error && data) {
        setPropertyDetails(data)
      }
    } catch (error) {
      console.error('Failed to fetch property details:', error)
    }
  }

  // fix: fetch property financials with correct column names (Cursor Rule 4)
  const fetchPropertyFinancials = async (propertyId: string) => {
    try {
      if (!supabase) return

      const { data, error } = await supabase
        .from('property_financials')
        .select('*')
        .eq('property_id', propertyId)
        .single()

      if (!error && data) {
        setPropertyFinancials(data)
      }
    } catch (error) {
      console.error('Failed to fetch property financials:', error)
    }
  }

  // fix: fetch property activity from both order_book and property_activity tables (Cursor Rule 4)
  const fetchPropertyActivity = async (propertyId: string) => {
    try {
      if (!supabase) return

      // Get orders from order_book table
      const { data: orderData, error: orderError } = await supabase
        .from('order_book')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(25)

      // Get executed trades from property_activity table
      const { data: activityData, error: activityError } = await supabase
        .from('property_activity')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(25)

      console.log('📊 Property activity fetch results:', { 
        propertyId, 
        orderCount: orderData?.length || 0, 
        activityCount: activityData?.length || 0,
        orderError,
        activityError
      })

      const combinedActivity = []

      // Transform order_book data
      if (!orderError && orderData) {
        const orderActivity = orderData.map(order => ({
          id: `order_${order.id}`,
          property_id: order.property_id,
          activity_type: (order.order_type === 'buy' ? 'buy_order' : 'sell_order') as 'buy_order' | 'sell_order',
          wallet_address: order.user_address,
          share_count: order.shares,
          price_per_share: order.price_per_share,
          total_amount: order.shares * order.price_per_share,
          transaction_hash: order.transaction_hash,
          created_at: order.created_at
        }))
        combinedActivity.push(...orderActivity)
      }

      // Add property_activity data directly
      if (!activityError && activityData) {
        const formattedActivity = activityData.map(activity => ({
          id: `activity_${activity.id}`,
          property_id: activity.property_id,
          activity_type: activity.activity_type,
          wallet_address: activity.wallet_address,
          share_count: activity.share_count,
          price_per_share: activity.price_per_share,
          total_amount: activity.total_amount,
          transaction_hash: activity.transaction_hash,
          created_at: activity.created_at
        }))
        combinedActivity.push(...formattedActivity)
      }

      // Sort by created_at and remove duplicates based on transaction_hash
      const sortedActivity = combinedActivity
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .filter((activity, index, arr) => {
          // Remove duplicates based on transaction hash
          if (!activity.transaction_hash) return true
          return arr.findIndex(a => a.transaction_hash === activity.transaction_hash) === index
        })
        .slice(0, 50) // Limit to 50 most recent
        
      setPropertyActivity(sortedActivity)
      console.log('✅ Property activity state updated with', sortedActivity.length, 'combined records')
    } catch (error) {
      console.error('Failed to fetch property activity:', error)
    }
  }

  // fix: fetch funding progress from payment_authorizations (Cursor Rule 4)
  const fetchFundingProgress = async (propertyId: string, fundingGoal: number) => {
    try {
      if (!supabase) return

      const { data: authData, error: authError } = await supabase
        .from('payment_authorizations')
        .select('usdc_amount')
        .eq('property_id', propertyId)
        .in('payment_status', ['approved', 'transferred'])

      if (!authError && authData) {
        const raisedAmount = authData.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount), 0)
        const progressPercentage = Math.min((raisedAmount / fundingGoal) * 100, 100)
        
        setFundingProgress({
          raised_amount: raisedAmount,
          progress_percentage: Math.round(progressPercentage * 100) / 100
        })
      }
    } catch (error) {
      console.error('Failed to fetch funding progress:', error)
    }
  }

  // fix: fetch user's existing reservation via API (Cursor Rule 4)
  const fetchUserReservation = async (propertyId: string, walletAddress: string) => {
    try {
      const response = await fetch('/api/reservations', {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        return
      }

      const data = await response.json()
      const userReservation = data.reservations?.find((r: any) => r.property_id === propertyId)
      
      if (userReservation) {
        setExistingReservation({
          id: userReservation.id,
          usdc_amount: userReservation.usdc_amount,
          token_amount: userReservation.token_amount,
          payment_status: userReservation.payment_status
        })
      } else {
        setExistingReservation(null)
      }
    } catch (error) {
      // Silently fail - user might not be authenticated
    }
  }

  // fix: refresh data after trade success (Cursor Rule 4)
  const handleTradeSuccess = () => {
    if (propertyId && property) {
      // Refresh all market data
      fetchPropertyActivity(propertyId)
      fetchMarketData(propertyId)
      fetchFundingProgress(propertyId, property.funding_goal_usdc)
      
      // Force UI refresh
      setTimeout(() => {
        fetchMarketData(propertyId)
      }, 2000)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const formatDeadline = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return 'Invalid date'
    }
  }

  const isDeadlinePassed = (dateString: string) => {
    try {
      return new Date(dateString) < new Date()
    } catch {
      return true
    }
  }

  // fix: determine if property is live for trading (Cursor Rule 4)
  const isPropertyLive = (status: string) => {
    return status === 'completed' || status === 'live'
  }

  const canReserve = () => {
    if (!property || !isConnected) return false
    if (isDeadlinePassed(property.funding_deadline)) return false
    if (property.status !== 'active') return false
    if (fundingProgress.progress_percentage >= 100) return false
    return true
  }

  const statusColors = {
    active: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    funded: 'bg-openhouse-accent/10 text-openhouse-accent border-openhouse-accent/20',
    completed: 'bg-openhouse-fg-muted/10 text-openhouse-fg-muted border-openhouse-fg-muted/20',
    live: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    draft: 'bg-openhouse-warning/10 text-openhouse-warning border-openhouse-warning/20'
  }

  // fix: render token metadata for live properties only (Cursor Rule 4)
  const renderTokenMetadata = () => {
    if (!isPropertyLive(property?.status || '') || !tokenDetails) {
      return null
    }

    return (
      <Card className="p-0 mt-0">
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4 items-center justify-center p-4 px-6 bg-openhouse-bg-muted rounded-md">
            <div>
              <p className="text-sm text-openhouse-fg-muted">Available</p>
              <p className="font-semibold text-openhouse-fg">
                {availableShares !== null ? availableShares.toLocaleString() : tokenDetails?.available_shares?.toLocaleString() || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-openhouse-fg-muted">Price</p>
              <p className="font-semibold text-openhouse-fg">
                {formatCurrency(currentPrice || property?.price_per_token || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-openhouse-fg-muted">Annual Yield</p>
              <p className="font-semibold text-openhouse-fg">
                {propertyFinancials?.annual_yield_pct ? formatPercentage(propertyFinancials.annual_yield_pct) : 'N/A'}
              </p>
            </div>
          </div>
          
          <Button 
            onClick={() => setIsTradingModalOpen(true)}
            className="w-full"
            disabled={!isConnected}
          >
            {isConnected ? 'Trade Shares' : 'Connect Wallet to Trade'}
          </Button>
          
          <div className="pt-0">
            <p className="text-openhouse-fg-muted text-sm">
              {/* TODO: Add description field to properties or property_details table in Supabase */}
              This property represents a tokenized real estate investment opportunity. 
              Each token represents fractional ownership of the underlying property.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // fix: render property details tab with actual data (Cursor Rule 4)
  const renderDetailsTab = () => {
    if (!propertyDetails) {
      return (
        <div className="text-center py-8">
          <Info className="w-12 h-12 text-openhouse-fg-muted mx-auto mb-4" />
          <p className="text-openhouse-fg-muted">Property details not available</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div>
          <div>
            <div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Type</span>
                <span className="text-openhouse-fg">{propertyDetails.property_type}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Bedrooms</span>
                <span className="text-openhouse-fg">{propertyDetails.bedrooms}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Bathrooms</span>
                <span className="text-openhouse-fg">{propertyDetails.bathrooms}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Square Footage</span>
                <span className="text-openhouse-fg">{propertyDetails.square_footage?.toLocaleString()} sq ft</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Address</span>
                <span className="text-openhouse-fg">{propertyDetails.full_address}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">City</span>
                <span className="text-openhouse-fg">{propertyDetails.city}</span>
              </div>
            </div>
          </div>
        </div>

        {propertyDetails.ownership_model && (
          <div>
            <h4 className="font-semibold text-openhouse-fg mb-3">Ownership Structure</h4>
            <p className="text-openhouse-fg-muted">{propertyDetails.ownership_model}</p>
          </div>
        )}

        {propertyDetails.lease_information && (
          <div>
            <h4 className="font-semibold text-openhouse-fg mb-3">Lease Information</h4>
            <p className="text-openhouse-fg-muted">{propertyDetails.lease_information}</p>
          </div>
        )}

        {propertyDetails.amenities && propertyDetails.amenities.length > 0 && (
          <div>
            <h4 className="font-semibold text-openhouse-fg mb-3">Amenities</h4>
            <div className="flex flex-wrap gap-2">
              {propertyDetails.amenities.map((amenity, index) => (
                <Badge key={index} variant="outline" className="text-openhouse-fg-muted">
                  {amenity}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // fix: render financials tab with correct column names (Cursor Rule 4)
  const renderFinancialsTab = () => {
    if (!propertyFinancials) {
      return (
        <div className="text-center py-8">
          <DollarSign className="w-12 h-12 text-openhouse-fg-muted mx-auto mb-4" />
          <p className="text-openhouse-fg-muted">Financial data not available</p>
        </div>
      )
    }

    return (
      <div>
        <div>
          <div>
            <div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Property Value</span>
                <span className="text-openhouse-fg">{formatCurrency(propertyFinancials.property_value)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Price Per Share</span>
                <span className="text-openhouse-fg">{formatCurrency(propertyFinancials.price_per_share)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Net Operating Income</span>
                <span className="text-openhouse-fg">{formatCurrency(propertyFinancials.net_operating_income)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Expense Ratio</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.expense_ratio * 100)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Vacancy Rate</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.vacancy_rate * 100)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Cap Rate</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.cap_rate)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">ROI</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.roi)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Cash on Cash</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.cash_on_cash)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Monthly Income</span>
                <span className="text-openhouse-fg">{formatCurrency(propertyFinancials.monthly_income)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Annual Yield</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.annual_yield_pct)}</span>
              </div>
              <div className="flex justify-between py-4 border-b border-openhouse-border text-sm">
                <span className="text-openhouse-fg-muted">Annual Return</span>
                <span className="text-openhouse-fg">{formatPercentage(propertyFinancials.annual_return)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // fix: render activity tab with Foundation/OpenSea style (Cursor Rule 4)
  const renderActivityTab = () => {
    if (propertyActivity.length === 0) {
      return (
        <div className="text-center py-8">
          <Activity className="w-12 h-12 text-openhouse-fg-muted mx-auto mb-4" />
          <p className="text-openhouse-fg-muted">No trading activity yet</p>
        </div>
      )
    }

    return (
      <div className="space-y-0">
        {propertyActivity.map((activity, index) => (
          <div key={activity.id} className={`flex items-center justify-between py-4 ${
            index !== propertyActivity.length - 1 ? 'border-b border-openhouse-border' : ''
          }`}>
            <div className="flex items-center gap-3">
              {/* Activity Icon */}
              <div className="w-10 h-10 rounded-full bg-openhouse-bg-muted flex items-center justify-center">
                <div className={`w-2 h-2 rounded-full ${
                  activity.activity_type === 'buy_order' ? 'bg-openhouse-success' :
                  activity.activity_type === 'sell_order' ? 'bg-openhouse-warning' :
                  activity.activity_type === 'trade_executed' ? 'bg-openhouse-accent' :
                  'bg-openhouse-fg-muted'
                }`} />
              </div>
              
              <div>
                {/* Activity Title */}
                <p className="font-medium text-sm text-openhouse-fg">
                  {activity.activity_type === 'buy_order' && 'Buy order placed by'}
                  {activity.activity_type === 'sell_order' && 'Sell order placed by'}
                  {activity.activity_type === 'trade_executed' && 'Trade executed by'}
                  {activity.activity_type === 'yield_distributed' && 'Yield distributed to'}
                  {' '}
                  <span className="font-semibold">
                    {activity.wallet_address.slice(0, 6)}...{activity.wallet_address.slice(-4)}
                  </span>
                </p>
                
                {/* Activity Details */}
                <div className="flex items-center gap-2 text-sm text-openhouse-fg-muted">
                  <span>{formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}</span>
                  {activity.transaction_hash && (
                    <>
                      <span>•</span>
                      <Link
                        href={`https://basescan.org/tx/${activity.transaction_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-openhouse-accent hover:underline inline-flex items-center gap-1"
                      >
                        View transaction
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Price/Amount */}
            <div className="text-right text-sm">
              {activity.share_count && activity.price_per_share && (
                <>
                  <p className="text-openhouse-fg text-sm">
                    {formatCurrency(activity.price_per_share)}
                  </p>
                  <p className="text-sm text-openhouse-fg-muted">
                    {activity.share_count} share{activity.share_count !== 1 ? 's' : ''}
                  </p>
                </>
              )}
              {activity.total_amount && !activity.price_per_share && (
                <p className="text-openhouse-fg text-sm">
                  {formatCurrency(activity.total_amount)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-openhouse-bg">
        <div className="container mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-openhouse-bg-muted rounded mb-4 w-32"></div>
            <div className="h-12 bg-openhouse-bg-muted rounded mb-8 w-64"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="h-64 bg-openhouse-bg-muted rounded mb-6"></div>
                <div className="h-32 bg-openhouse-bg-muted rounded"></div>
              </div>
              <div className="space-y-4">
                <div className="h-48 bg-openhouse-bg-muted rounded"></div>
                <div className="h-24 bg-openhouse-bg-muted rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-openhouse-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-openhouse-fg mb-4">Property Not Found</h1>
          <p className="text-openhouse-fg-muted mb-8">{error || 'The requested property could not be found.'}</p>
          <Link href="/" className="text-openhouse-accent hover:underline">
            Return to Properties
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-openhouse-bg">
      <div className="container mx-auto px-4">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Property Image Only */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Video */}
            <Card>
              <CardContent className="p-10">
                <div className="relative overflow-hidden rounded-sm h-[900px]">
                  {/* fix: use dynamic video_thumbnail from Supabase for property showcase (Cursor Rule 4) */}
                  {(() => {
                    console.log('🎬 Rendering decision:', { 
                      hasVideo: !!property.video_thumbnail, 
                      videoUrl: property.video_thumbnail,
                      hasImage: !!property.image_url 
                    })
                    return null
                  })()}
                  {property.video_thumbnail ? (
                    <video
                      className="absolute inset-0 w-full h-full object-cover rounded-sm"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      poster={property.image_url || undefined}
                    >
                      <source 
                        src={property.video_thumbnail} 
                        type="video/mp4" 
                      />
                      {/* Fallback to image if video fails to load */}
                      {property.image_url ? (
                        <Image
                          src={property.image_url}
                          alt={property.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 100vw, 66vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-openhouse-bg-muted to-openhouse-bg">
                          <div className="w-24 h-24 rounded-lg bg-openhouse-accent/10 flex items-center justify-center">
                            <Building2 className="w-12 h-12 text-openhouse-accent" />
                          </div>
                        </div>
                      )}
                    </video>
                  ) : property.image_url ? (
                    <Image
                      src={property.image_url}
                      alt={property.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-openhouse-bg-muted to-openhouse-bg">
                      <div className="w-24 h-24 rounded-lg bg-openhouse-accent/10 flex items-center justify-center">
                        <Building2 className="w-12 h-12 text-openhouse-accent" />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Property Details + Tabs */}
          <div className="lg:col-span-1 space-y-6 pl-20 pt-10 border-l border-openhouse-border">
            {/* Property Header */}
            <div className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {isPropertyLive(property.status) ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex flex-row items-center gap-2">
                        <Image 
                          className="rounded-full" 
                          src="https://vnxbsnahzolxhcyxrwcm.supabase.co/storage/v1/object/sign/images/token/visualelectric-1750966650984.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80MGU2Zjk2OS1lYjI4LTRlM2QtYjBlOS1hYWYwYmJjNDJjNDgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvdG9rZW4vdmlzdWFsZWxlY3RyaWMtMTc1MDk2NjY1MDk4NC5wbmciLCJpYXQiOjE3NTA5NzExNDMsImV4cCI6MTc4MjUwNzE0M30.iN9vpU3fmJ5TMh-jviBjosDhLb78EqCj1E3OxKAQy6I" 
                          alt="Token Logo"
                          width={40} 
                          height={40} 
                          />
                        <div className="flex flex-col items-start gap-1">
                          <button
                            onClick={() => setIsTokenInfoModalOpen(true)}
                            className="font-heading font-title text-4xl leading-tight font-semibold text-openhouse-fg hover:text-openhouse-accent transition-colors text-left"
                          >
                            {property.name}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h1 className="font-heading text-2xl font-semibold text-openhouse-fg">
                        {property.name}
                      </h1>
                    </div>
                  )}
                </div>
                <Badge className={statusColors[property.status]} variant="outline">
                  {property.status === 'live' ? 'Live' : property.status}
                </Badge>
              </div>
            </div>

            {/* Token Metadata (Live Properties Only) */}
            {renderTokenMetadata()}

            {/* Basic Property Details (Non-Live Properties) */}
            {!isPropertyLive(property.status) && (
              <Card className="p-0 mt-0">
                <CardContent className="p-0">
                  <div className="grid grid-cols-3 gap-4 items-center justify-center p-4 px-6 bg-openhouse-bg-muted rounded-md">
                    <div>
                      <p className="text-sm text-openhouse-fg-muted">Total Shares</p>
                      <p className="font-semibold text-openhouse-fg">{property.total_shares.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-openhouse-fg-muted">Price Per Share</p>
                      <p className="font-semibold text-openhouse-fg">{formatCurrency(property.price_per_token)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-openhouse-fg-muted">Annual Yield</p>
                      <p className="font-semibold text-openhouse-fg">
                        {propertyFinancials?.annual_yield_pct 
                          ? `${propertyFinancials.annual_yield_pct.toFixed(1)}%` 
                          : 'TBD'
                        }
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-6 my-4 mb-0">            
                    <div className="space-y-4 my-4">
                      {canReserve() ? (
                        <Button 
                          onClick={() => setIsReservationModalOpen(true)}
                          className="w-full"
                          disabled={!isConnected}
                        >
                          {isConnected ? 'Reserve Shares' : 'Connect Wallet to Reserve'}
                        </Button>
                      ) : (
                        <Button disabled className="w-full">
                          {property.status !== 'active' ? 'Funding Closed' :
                          fundingProgress.progress_percentage >= 100 ? 'Fully Funded' :
                          isDeadlinePassed(property.funding_deadline) ? 'Deadline Passed' :
                          'Connect Wallet'}
                        </Button>
                      )}
                    </div>
                    
                    {/* Active Funding Badge 
                    <div className="mb-4">
                      <span className="inline-flex items-center px-0 py-1 text-sm font-medium bg-openhouse-accent/10 text-openhouse-accent">
                        <div className="w-2 h-2 bg-openhouse-accent mr-2 animate-pulse"></div>
                        Active Funding
                      </span>
                    </div>*/}
                    
                    <div className="flex items-center gap-8">
                      <div className="flex flex-col items-center gap-1">
                        <h3 className="text-sm text-openhouse-fg-muted">Current Funding:</h3>
                        <p className="text-2xl font-semibold text-openhouse-fg">
                          {/*{fundingProgress.progress_percentage.toFixed(0)}% */}
                          {formatCurrency(fundingProgress.raised_amount)} <span className="text-sm text-openhouse-fg-muted">of {formatCurrency(property.funding_goal_usdc)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-openhouse-fg-muted">
                        <h3 className="text-sm text-openhouse-fg-muted">Ends In:</h3>
                        <p className="text-2xl font-semibold text-openhouse-fg">{formatDeadline(property.funding_deadline)}</p>
                      </div>
                    </div>
                    <div className="w-full bg-openhouse-button-secondary rounded-full h-2 mt-4 mb-2">
                      <div 
                        className="bg-openhouse-accent h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${Math.min(fundingProgress.progress_percentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  {existingReservation && (
                    <div className="p-3 bg-openhouse-accent/10 border border-openhouse-accent/20">
                      <p className="text-sm font-medium text-openhouse-accent mb-1">Your Reservation</p>
                      <p className="text-xs text-openhouse-fg-muted">
                        {existingReservation.token_amount} shares • {formatCurrency(existingReservation.usdc_amount)}
                      </p>
                      <p className="text-xs text-openhouse-fg-muted">
                        Status: {existingReservation.payment_status}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tabbed Content - Now in Right Sidebar */}
            <Card className="p-0 mt-0 gap-0">
              <CardHeader className="p-0 border-b gap-0 mb-0 border-openhouse-border">
                <div className="flex flex-row gap-4 justify-start">
                  {(['details', 'financials', 'activity'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-2 text-sm font-medium transition-colors ${
                        activeTab === tab
                          ? 'bg-openhouse-bg text-openhouse-fg border-b-2 border-openhouse-accent'
                          : 'text-openhouse-fg-muted hover:text-openhouse-fg border-b-1 border-transparent'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {activeTab === 'details' && renderDetailsTab()}
                {activeTab === 'financials' && renderFinancialsTab()}
                {activeTab === 'activity' && renderActivityTab()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ReservationModal
        isOpen={isReservationModalOpen}
        onClose={() => setIsReservationModalOpen(false)}
        property={property}
        fundingProgress={fundingProgress}
        existingReservation={existingReservation}
        onReservationSuccess={() => {
          fetchUserReservation(propertyId, address || '')
          fetchFundingProgress(propertyId, property.funding_goal_usdc)
        }}
      />

      <TokenInformationModal
        isOpen={isTokenInfoModalOpen}
        onClose={() => setIsTokenInfoModalOpen(false)}
        property={{
          id: property.id,
          name: property.name,
          status: property.status,
          total_shares: property.total_shares,
          price_per_token: property.price_per_token,
          token_contract_address: tokenDetails?.contract_address
        }}
        tokenDetails={tokenDetails ? {
          token_name: tokenDetails.token_name,
          token_symbol: tokenDetails.token_symbol,
          total_supply: tokenDetails.total_shares,
          contract_address: tokenDetails.contract_address
        } : undefined}
      />

      <TradingModal
        isOpen={isTradingModalOpen}
        onClose={() => setIsTradingModalOpen(false)}
        property={{
          ...property,
          token_symbol: tokenDetails?.token_symbol || '',
          contract_address: tokenDetails?.contract_address,
          orderbook_contract_address: tokenDetails?.orderbook_contract_address
        }}
        onTradeSuccess={handleTradeSuccess}
      />
    </div>
  )
} 