'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { LoadingState } from '@/app/components/LoadingState'
import { AlertCircle, DollarSign, Rocket, Shield, CheckCircle, ExternalLink, Copy } from 'lucide-react'

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

interface TokenDeploymentResult {
  property_id: string
  property_name: string
  contract_address: string
  token_name: string
  token_symbol: string
  total_shares: number
  price_per_token: number
  deployment_hash: string
  treasury_address: string
  operator_address: string
  chain_id: number
  explorer_url: string
}

// fix: interface for USDC collection success results (Cursor Rule 7)
interface UsdcCollectionResult {
  property_name: string
  total_reservations: number
  successful_collections: number
  failed_collections: number
  total_amount_collected: number
  processed_reservations: Array<{
    wallet_address: string
    usdc_amount: number
    token_amount: number
    transfer_hash?: string
    mint_hash?: string
    status: string
  }>
}

// fix: AdminUser interface removed as it's not used (Cursor Rule 10)

export default function AdminDashboard() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyWithFunding[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [deploymentSuccess, setDeploymentSuccess] = useState<TokenDeploymentResult | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  // fix: add USDC collection success modal state (Cursor Rule 7)
  const [showUsdcSuccessModal, setShowUsdcSuccessModal] = useState(false)
  const [usdcCollectionSuccess, setUsdcCollectionSuccess] = useState<UsdcCollectionResult | null>(null)

  useEffect(() => {
    checkAdminAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]) // fix: checkAdminAccess is stable function defined in same component (Cursor Rule 6)

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
      
      // fix: use is_admin from API response instead of double-checking (Cursor Rule 7)
      if (!user.is_admin) {
        router.push('/')
        return
      }

      setIsAdmin(true)
      await fetchProperties()

    } catch {
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
    } finally {
      setIsLoading(false)
    }
  }

  // fix: collect USDC from approved reservations with success modal (Cursor Rule 4)
  const handleCollectUsdc = async (propertyId: string) => {
    try {
      setIsProcessing(propertyId)
      setError(null)
      
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

      // fix: show success modal with collection details (Cursor Rule 7)
      if (result.success && result.summary) {
        const property = properties.find(p => p.id === propertyId)
        setUsdcCollectionSuccess({
          property_name: property?.name || 'Unknown Property',
          total_reservations: result.summary.total_reservations || 0,
          successful_collections: result.summary.successful_collections || 0,
          failed_collections: result.summary.failed_collections || 0,
          total_amount_collected: result.summary.total_amount_collected || 0,
          processed_reservations: result.processed_reservations || []
        })
        setShowUsdcSuccessModal(true)
      }

      await fetchProperties() // Refresh data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to collect USDC'
      setError(errorMessage)
    } finally {
      setIsProcessing(null)
    }
  }

  // fix: deploy token contract for property with success modal (Cursor Rule 4)
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

      // fix: show success modal with deployment details (Cursor Rule 7)
      if (result.deployment) {
        setDeploymentSuccess(result.deployment)
        setShowSuccessModal(true)
      }

      await fetchProperties() // Refresh data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deploy token'
      setError(errorMessage)
    } finally {
      setIsProcessing(null)
    }
  }

  // fix: copy text to clipboard helper (Cursor Rule 7)
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
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
      case 'completed':
        return 'bg-emerald-100 text-emerald-800'
      case 'flagged_fake_data':
        return 'bg-red-100 text-red-800'
      case 'flagged_insufficient_valid_funding':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const canCollectUsdc = (property: PropertyWithFunding) => {
    // fix: disable operations on flagged properties (Cursor Rule 4)
    if (property.status.startsWith('flagged_')) return false
    
    // fix: disable USDC collection if already completed (Cursor Rule 7)
    if (property.status === 'completed') return false
    
    // fix: enable USDC collection when token is deployed and property is funded (Cursor Rule 4)
    return property.status === 'funded' && 
           property.token_contract_address // Token must be deployed first
  }

  const canDeployToken = (property: PropertyWithFunding) => {
    // fix: disable operations on flagged properties (Cursor Rule 4)
    if (property.status.startsWith('flagged_')) return false
    
    // fix: enable token deployment when funding goal is 100% met and property is active (Cursor Rule 4)
    return property.status === 'active' && 
           property.progress_percentage >= 100 &&
           !property.token_contract_address // Not yet deployed
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
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <Card>
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
                          <span className="text-sm text-gray-500">
                            {property.status.startsWith('flagged_') 
                              ? 'Property flagged - no actions available' 
                              : 'No actions available'
                            }
                          </span>
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

      {/* fix: Token Deployment Success Modal (Cursor Rule 7) */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              Token Deployment Successful
            </DialogTitle>
          </DialogHeader>
          
          {deploymentSuccess && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">
                  {deploymentSuccess.property_name} Token Deployed
                </h3>
                <p className="text-green-700 text-sm">
                  PropertyShareToken contract has been successfully deployed to the blockchain.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Token Name</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {deploymentSuccess.token_name}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Token Symbol</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {deploymentSuccess.token_symbol}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Shares</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {deploymentSuccess.total_shares.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Price per Token</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      ${deploymentSuccess.price_per_token}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Contract Address</label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-50 rounded border text-sm font-mono">
                        {deploymentSuccess.contract_address}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(deploymentSuccess.contract_address)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Deployment Hash</label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-50 rounded border text-sm font-mono">
                        {deploymentSuccess.deployment_hash.slice(0, 10)}...{deploymentSuccess.deployment_hash.slice(-8)}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(deploymentSuccess.deployment_hash)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Treasury Address</label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-50 rounded border text-sm font-mono">
                        {deploymentSuccess.treasury_address.slice(0, 10)}...{deploymentSuccess.treasury_address.slice(-8)}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(deploymentSuccess.treasury_address)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Operator Address</label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-50 rounded border text-sm font-mono">
                        {deploymentSuccess.operator_address.slice(0, 10)}...{deploymentSuccess.operator_address.slice(-8)}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(deploymentSuccess.operator_address)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Network: {deploymentSuccess.chain_id === 8453 ? 'Base Mainnet' : 'Base Sepolia'}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(deploymentSuccess.explorer_url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Explorer
                  </Button>
                  <Button onClick={() => setShowSuccessModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* fix: USDC Collection Success Modal (Cursor Rule 7) */}
      <Dialog open={showUsdcSuccessModal} onOpenChange={setShowUsdcSuccessModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              USDC Collection Successful
            </DialogTitle>
          </DialogHeader>
          
          {usdcCollectionSuccess && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-2">
                  {usdcCollectionSuccess.property_name} - Funding Complete
                </h3>
                <p className="text-green-700 text-sm">
                  USDC has been successfully collected from investors and property tokens have been minted.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Reservations</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {usdcCollectionSuccess.total_reservations}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Successful Collections</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm text-green-600 font-medium">
                      {usdcCollectionSuccess.successful_collections}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Failed Collections</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {usdcCollectionSuccess.failed_collections || 0}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Amount Collected</label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm font-medium">
                      {formatCurrency(usdcCollectionSuccess.total_amount_collected)}
                    </div>
                  </div>
                </div>
              </div>

              {usdcCollectionSuccess.processed_reservations.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Processed Reservations</label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Investor</th>
                          <th className="px-3 py-2 text-left">USDC</th>
                          <th className="px-3 py-2 text-left">Tokens</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usdcCollectionSuccess.processed_reservations.map((reservation, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">
                              {reservation.wallet_address.slice(0, 6)}...{reservation.wallet_address.slice(-4)}
                            </td>
                            <td className="px-3 py-2">
                              ${reservation.usdc_amount}
                            </td>
                            <td className="px-3 py-2">
                              {reservation.token_amount}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                reservation.status === 'success' || reservation.status === 'already_completed'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {reservation.status === 'already_completed' ? 'Already Completed' : 
                                 reservation.status === 'success' ? 'Success' : 'Failed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end pt-4 border-t">
                <Button onClick={() => setShowUsdcSuccessModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 