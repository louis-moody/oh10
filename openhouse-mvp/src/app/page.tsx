'use client'

import React, { useEffect, useState } from 'react'
import { supabase, type Property, type PropertyWithProgress } from '@/lib/supabase'
import { PropertyCard } from './components/PropertyCard'
import { EmptyState } from './components/EmptyState'
import { LoadingState } from './components/LoadingState'
import { AlertCircle } from 'lucide-react'

export default function HomePage() {
  const [properties, setProperties] = useState<PropertyWithProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProperties()
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
        .in('status', ['active', 'funded', 'completed'])
        .order('created_at', { ascending: false })

      if (propertiesError) {
        throw new Error(`Failed to fetch properties: ${propertiesError.message}`)
      }

      if (!propertiesData || propertiesData.length === 0) {
        setProperties([])
        return
      }

      // fix: show properties with zero progress until payment_authorizations table is properly configured (Cursor Rule 4)
      const propertiesWithProgress: PropertyWithProgress[] = propertiesData.map((property: Property) => ({
        ...property,
        raised_amount: 0,
        progress_percentage: 0
      }))

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
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <p className="text-openhouse-fg-muted text-lg">
            Build your legacy
          </p>
        </div>
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <p className="text-openhouse-fg-muted text-lg">
            Build your legacy
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-openhouse-danger/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-openhouse-danger" />
          </div>
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

  return (
    <div className="container mx-auto px-4 py-8">

      {properties.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  )
}
