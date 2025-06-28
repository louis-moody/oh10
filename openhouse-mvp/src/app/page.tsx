'use client'

import React, { useEffect, useState } from 'react'
import { supabase, type Property, type PropertyWithProgress } from '@/lib/supabase'
import { PropertyCard } from './components/PropertyCard'
import { EmptyState } from './components/EmptyState'
import { LoadingState } from './components/LoadingState'


export default function HomePage() {
  const [properties, setProperties] = useState<PropertyWithProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProperties()
  }, [])

  // fix: listen for logout events and reset state (Cursor Rule 6)
  useEffect(() => {
    const handleLogout = () => {
      console.log('🔄 HOME PAGE: User logged out, resetting state')
      setProperties([])
      setError(null)
      setIsLoading(false)
    }

    window.addEventListener('userLogout', handleLogout)
    return () => window.removeEventListener('userLogout', handleLogout)
  }, [])

  const fetchProperties = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // fix: handle case where Supabase is not configured (Cursor Rule 6)
      if (!supabase) {
        setError('Supabase configuration is missing. Please set up your environment variables.')
        return
      }

      // fix: fetch properties without payment authorization data to avoid RLS issues (Cursor Rule 4)
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .in('status', ['active', 'funded', 'live', 'completed'])
        .order('created_at', { ascending: false })

      if (propertiesError) {
        throw new Error(`Failed to fetch properties: ${propertiesError.message}`)
      }

      if (!propertiesData || propertiesData.length === 0) {
        setProperties([])
        return
      }

      // fix: calculate real funding progress for each property from payment_authorizations (Cursor Rule 4)
      const propertiesWithProgress: PropertyWithProgress[] = []

      for (const property of propertiesData) {
        let raisedAmount = 0
        let progressPercentage = 0

        // fix: handle completed/funded properties that may not have payment_authorizations data (Cursor Rule 4)
        if (property.status === 'completed' || property.status === 'live' || property.status === 'funded') {
          // fix: for completed properties, assume funding goal was met (Cursor Rule 4)
          raisedAmount = property.funding_goal_usdc
          progressPercentage = 100
          console.log(`✅ HOME PAGE: Property ${property.name} is ${property.status} - showing as 100% funded`)
        } else {
          // fix: for active properties, check actual payment authorization data (Cursor Rule 4)
          const { data: authData, error: authError } = await supabase
            .from('payment_authorizations')
            .select('usdc_amount')
            .eq('property_id', property.id)
            .in('payment_status', ['approved', 'transferred'])

          console.log(`🏠 HOME PAGE: Checking funding for active property ${property.name}:`, {
            property_id: property.id,
            authError: authError?.message,
            authDataCount: authData?.length || 0
          })

          if (!authError && authData && authData.length > 0) {
            raisedAmount = authData.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount), 0)
            progressPercentage = Math.min((raisedAmount / property.funding_goal_usdc) * 100, 100)
            console.log(`💰 HOME PAGE: Calculated raised amount for ${property.name}: $${raisedAmount} (${progressPercentage.toFixed(1)}%)`)
          } else {
            console.log(`📊 HOME PAGE: No funding data found for ${property.name} - showing as 0% funded`)
          }
        }

        propertiesWithProgress.push({
          ...property,
          raised_amount: raisedAmount,
          progress_percentage: Math.round(progressPercentage * 100) / 100
        })
      }

      setProperties(propertiesWithProgress)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)

    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-0 py-0">
        <div className="mb-8">
        </div>
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-0 py-0">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <h3 className="font-heading text-lg font-semibold text-openhouse-fg mb-2">
            Unable to load properties
          </h3>
          <p className="text-openhouse-fg-muted max-w-sm mb-4">
            {error}
          </p>
          {!error.includes('configuration') && (
            <button
              onClick={fetchProperties}
              className="px-4 py-2 bg-openhouse-accent text-openhouse-accent-fg rounded-lg hover:bg-openhouse-accent/90 transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  // fix: organize properties by status (Cursor Rule 4)
  const organizeProperties = () => {
    const organized = {
      funding: properties.filter(p => p.status === 'active'),
      trading: properties.filter(p => p.status === 'live' || p.status === 'completed'),
      funded: properties.filter(p => p.status === 'funded')
    }

    return organized
  }

  const organizedProperties = organizeProperties()

  const renderPropertySection = (title: string, properties: PropertyWithProgress[], description?: string) => {
    if (properties.length === 0) return null

    return (
      <div className="mb-3">
        <div className="mb-3">
          <h2 className=" text-xl font-medium my-8 py-2 font-medium text-openhouse-fg mb-2">
            {title}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-2">
          {properties
            .sort((a, b) => b.raised_amount - a.raised_amount) // Sort by highest funding first
            .slice(0, 4)
            .map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Properties Section */}
      <div className="container mx-auto px-0 py-0">
        {properties.length === 0 ? (
          <EmptyState />
        ) : (
            <>
            {/* Property Sections */}
            {renderPropertySection(
              'Funding Now',
              organizedProperties.funding,
            )}

            {renderPropertySection(
              'Buy Now',
              organizedProperties.trading,
            )}

            {renderPropertySection(
              'Fully Funded',
              organizedProperties.funded,
            )}
          </>
        )}
      </div>
    </>
  )
}
