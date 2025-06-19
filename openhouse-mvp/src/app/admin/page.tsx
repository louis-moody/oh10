'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { LoadingState } from '@/app/components/LoadingState'
import { AlertCircle, DollarSign, Rocket, Shield } from 'lucide-react'

interface PropertyWithFunding {
  id: string
  name: string
  funding_goal_usdc: number
  status: string
  raised_amount: number 
  progress_percentage: number
  token_contract_address?: string
  payment_count: number
}

interface AdminUser {
  id: string
  wallet_address: string
  is_admin: boolean
}

export default function AdminDashboard() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyWithFunding[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)

  useEffect(() => {
    checkAdminAccess()
  }, [])

  // fix: check if current user has admin access from Supabase users table (Cursor Rule 5)
  const checkAdminAccess = async () => {
    try {
      if (!supabase) {
        setError('Database configuration error')
        return
      }

      // fix: get current user from session cookie (Cursor Rule 3)
      const response = await fetch('/api/user-profile')
      if (!response.ok) {
        router.push('/')
        return
      }

      const { user } = await response.json()
      
      // fix: check is_admin flag from users table (Cursor Rule 4)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('wallet_address', user.wallet_address)
        .single()

      if (userError || !userData?.is_admin) {
        router.push('/')
        return
      }

      setIsAdmin(true)
      await fetchProperties()

    } catch (err) {
      console.error('Admin access check error:', err)
      router.push('/')
    }
  }

  // fix: fetch all properties with funding progress calculation (Cursor Rule 4)
  const fetchProperties = async () => {
    try {
      setIsLoading(true)
      setError(null)

      if (!supabase) {
        setError('Database configuration error')
        return
      }

      // fix: fetch properties data (Cursor Rule 4)
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })

      if (propertiesError) {
        throw new Error(`Failed to fetch properties: ${propertiesError.message}`)
      }

      if (!propertiesData || propertiesData.length === 0) {
        setProperties([])
        return
      }

      // fix: calculate funding progress for each property (Cursor Rule 4)
      const propertiesWithFunding: PropertyWithFunding[] = []

      for (const property of propertiesData) {
        const { data: authData, error: authError } = await supabase
          .from('payment_authorizations')
          .select('usdc_amount')
          .eq('property_id', property.id)
          .eq('payment_status', 'approved')

        let raisedAmount = 0
        let paymentCount = 0

        if (!authError && authData) {
          raisedAmount = authData.reduce((sum, auth) => sum + parseFloat(auth.usdc_amount), 0)
          paymentCount = authData.length
        }

        const progressPercentage = Math.min((raisedAmount / property.funding_goal_usdc) * 100, 100)

        propertiesWithFunding.push({
          ...property,
          raised_amount: raisedAmount,
          progress_percentage: Math.round(progressPercentage * 100) / 100,
          payment_count: paymentCount
        })
      }

      setProperties(propertiesWithFunding)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch properties'
      setError(errorMessage)
      console.error('Error fetching properties:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // fix: collect USDC from approved reservations (Cursor Rule 4)
  const handleCollectUsdc = async (propertyId: string) => {
    try {
      setIsProcessing(propertyId)
      
      const response = await fetch('/api/admin/collect-usdc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ property_id: propertyId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to collect USDC')
      }

      console.log('USDC collection result:', result)
      await fetchProperties() // Refresh data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to collect USDC'
      setError(errorMessage)
      console.error('USDC collection error:', err)
    } finally {
      setIsProcessing(null)
    }
  }

  // fix: deploy token contract for property (Cursor Rule 4)
  const handleDeployToken = async (propertyId: string) => {
    try {
      setIsProcessing(propertyId)
      
      const response = await fetch('/api/admin/deploy-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ property_id: propertyId }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to deploy token')
      }

      console.log('Token deployment result:', result)
      await fetchProperties() // Refresh data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deploy token'
      setError(errorMessage)
      console.error('Token deployment error:', err)
    } finally {
      setIsProcessing(null)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-100 text-blue-800'
      case 'funded':
        return 'bg-green-100 text-green-800'
      case 'deployed':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const canCollectUsdc = (property: PropertyWithFunding) => {
    return property.status === 'active' && 
           property.progress_percentage >= 100 &&
           !property.token_contract_address
  }

  const canDeployToken = (property: PropertyWithFunding) => {
    return property.status === 'funded' && 
           property.token_contract_address
  }

  if (!isAdmin) {
    return <LoadingState />
  }

  if (isLoading) {
    return <LoadingState />
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-600">Manage crowdfunding properties</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No properties found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Funding Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((property) => (
                  <TableRow key={property.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{property.name}</div>
                        <div className="text-sm text-gray-500">
                          Goal: {formatCurrency(property.funding_goal_usdc)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium">
                          {formatCurrency(property.raised_amount)} / {formatCurrency(property.funding_goal_usdc)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {property.progress_percentage}% • {property.payment_count} investors
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(property.progress_percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(property.status)}>
                        {property.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {canCollectUsdc(property) && (
                          <Button
                            size="sm"
                            onClick={() => handleCollectUsdc(property.id)}
                            disabled={isProcessing === property.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            {isProcessing === property.id ? 'Collecting...' : 'Collect USDC'}
                          </Button>
                        )}
                        {canDeployToken(property) && (
                          <Button
                            size="sm"
                            onClick={() => handleDeployToken(property.id)}
                            disabled={isProcessing === property.id}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Rocket className="h-4 w-4 mr-1" />
                            {isProcessing === property.id ? 'Deploying...' : 'Deploy Token'}
                          </Button>
                        )}
                        {!canCollectUsdc(property) && !canDeployToken(property) && (
                          <span className="text-sm text-gray-500">No actions available</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 