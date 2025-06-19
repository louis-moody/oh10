'use client'

import React, { useEffect, useState } from 'react'
import { Building2, ArrowLeft, Calendar, DollarSign, Users, Clock, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase, type Property } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { ReservationModal } from '@/app/components/ReservationModal'
import { formatDistanceToNow } from 'date-fns'
import { useAccount } from 'wagmi'

interface PropertyDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const [property, setProperty] = useState<Property | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [fundingProgress, setFundingProgress] = useState({ raised_amount: 0, progress_percentage: 0 })
  const { isConnected } = useAccount()
  const [propertyId, setPropertyId] = useState<string>('')

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setPropertyId(resolvedParams.id)
      fetchPropertyDetails(resolvedParams.id)
    }
    getParams()
  }, [params])

  const fetchPropertyDetails = async (id: string) => {
    try {
      setIsLoading(true)
      setError(null)

      if (!supabase) {
        setError('Database configuration error')
        return
      }

      // fix: fetch property details from Supabase (Cursor Rule 4)
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

      setProperty(propertyData)

      // fix: fetch funding progress from payment_authorizations (Cursor Rule 4)
      const { data: authData, error: authError } = await supabase
        .from('payment_authorizations')
        .select('usdc_amount')
        .eq('property_id', id)
        .eq('payment_status', 'approved')

      if (!authError && authData) {
        const raisedAmount = authData.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount), 0)
        const progressPercentage = Math.min((raisedAmount / propertyData.funding_goal_usdc) * 100, 100)
        
        setFundingProgress({
          raised_amount: raisedAmount,
          progress_percentage: Math.round(progressPercentage * 100) / 100
        })
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      console.error('Error fetching property details:', err)
    } finally {
      setIsLoading(false)
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
    draft: 'bg-openhouse-warning/10 text-openhouse-warning border-openhouse-warning/20'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-openhouse-bg">
        <div className="container mx-auto px-4 py-8">
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

  if (error) {
    return (
      <div className="min-h-screen bg-openhouse-bg">
        <div className="container mx-auto px-4 py-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-openhouse-fg-muted hover:text-openhouse-fg transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Properties
          </Link>
          
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-openhouse-danger/10 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-openhouse-danger" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-openhouse-fg mb-2">
              Error Loading Property
            </h3>
            <p className="text-openhouse-fg-muted max-w-md mb-4">
              {error}
            </p>
            <Button onClick={() => fetchPropertyDetails(propertyId)}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-openhouse-bg">
        <div className="container mx-auto px-4 py-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-openhouse-fg-muted hover:text-openhouse-fg transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Properties
          </Link>
          
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-openhouse-fg-muted/10 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-openhouse-fg-muted" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-openhouse-fg mb-2">
              Property Not Found
            </h3>
            <p className="text-openhouse-fg-muted">
              The property you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-openhouse-bg">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-openhouse-fg-muted hover:text-openhouse-fg transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Properties
          </Link>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-openhouse-accent" />
              <h1 className="font-heading text-3xl font-bold text-openhouse-fg">
                {property.name}
              </h1>
            </div>
            <Badge className={statusColors[property.status]} variant="outline">
              {property.status}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Image */}
            <Card>
              <CardContent className="p-0">
                <div className="aspect-[16/9] relative overflow-hidden rounded-lg">
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
                </div>
              </CardContent>
            </Card>

            {/* Property Details */}
            <Card>
              <CardHeader>
                <CardTitle>Property Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-openhouse-fg-muted">Total Shares</p>
                    <p className="font-semibold text-openhouse-fg">
                      {property.total_shares.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-openhouse-fg-muted">Price per Share</p>
                    <p className="font-semibold text-openhouse-fg">
                      {formatCurrency(property.price_per_token)}
                    </p>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-openhouse-border">
                  <p className="text-openhouse-fg-muted">
                    This property represents a tokenized real estate investment opportunity. 
                    Each token represents fractional ownership of the underlying property.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Funding Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Funding Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-openhouse-fg">
                    {fundingProgress.progress_percentage}%
                  </p>
                  <p className="text-sm text-openhouse-fg-muted">funded</p>
                </div>
                
                <div className="w-full bg-openhouse-bg-muted rounded-full h-3">
                  <div 
                    className="bg-openhouse-success h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(fundingProgress.progress_percentage, 100)}%` }}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-openhouse-fg-muted">Raised</span>
                    <span className="font-medium text-openhouse-fg">
                      {formatCurrency(fundingProgress.raised_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-openhouse-fg-muted">Goal</span>
                    <span className="font-medium text-openhouse-fg">
                      {formatCurrency(property.funding_goal_usdc)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Investment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Investment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-openhouse-fg-muted">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Available Shares</span>
                  </div>
                  <span className="font-medium text-openhouse-fg">
                    {(property.total_shares - Math.floor((fundingProgress.raised_amount / property.price_per_token))).toLocaleString()}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-openhouse-fg-muted">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Funding Ends</span>
                  </div>
                  <span className={`font-medium ${isDeadlinePassed(property.funding_deadline) ? 'text-openhouse-danger' : 'text-openhouse-fg'}`}>
                    {formatDeadline(property.funding_deadline)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-openhouse-fg-muted">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">Status</span>
                  </div>
                  <Badge className={statusColors[property.status]} variant="outline">
                    {property.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Reserve Button */}
            <Card>
              <CardContent className="pt-6">
                {!isConnected ? (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-openhouse-fg-muted">
                      Connect your wallet to reserve shares
                    </p>
                    <Button disabled className="w-full">
                      Connect Wallet First
                    </Button>
                  </div>
                ) : canReserve() ? (
                  <div className="space-y-3">
                    <Button 
                      onClick={() => setIsReservationModalOpen(true)}
                      className="w-full bg-openhouse-accent hover:bg-openhouse-accent/90 text-openhouse-accent-fg"
                      size="lg"
                    >
                      Reserve Shares
                    </Button>
                    <p className="text-xs text-openhouse-fg-muted text-center">
                      Reserve now, pay when funding goal is reached
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-openhouse-fg-muted">
                      {isDeadlinePassed(property.funding_deadline) 
                        ? 'Funding deadline has passed'
                        : property.status !== 'active'
                        ? 'Property is not accepting reservations'
                        : 'Funding goal reached'
                      }
                    </p>
                    <Button disabled className="w-full">
                      Reservations Closed
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Reservation Modal */}
      {property && (
        <ReservationModal
          isOpen={isReservationModalOpen}
          onClose={() => setIsReservationModalOpen(false)}
          property={property}
          fundingProgress={fundingProgress}
          onReservationSuccess={() => {
            setIsReservationModalOpen(false)
            fetchPropertyDetails(propertyId) // Refresh data
          }}
        />
      )}
    </div>
  )
} 