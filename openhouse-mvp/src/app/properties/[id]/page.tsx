import React from 'react'
import { Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PropertyDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = await params
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
          
          <div className="flex items-center gap-3 mb-4">
            <Building2 className="w-8 h-8 text-openhouse-accent" />
            <h1 className="font-heading text-3xl font-bold text-openhouse-fg">
              Property Details
            </h1>
          </div>
          
          <p className="text-openhouse-fg-muted text-lg">
            Property ID: {id}
          </p>
        </div>

        <div className="bg-openhouse-card border border-openhouse-border rounded-lg p-6">
          <h2 className="font-heading text-xl font-semibold text-openhouse-fg mb-4">
            Property Information
          </h2>
          <p className="text-openhouse-fg-muted">
            Property details will be displayed here once the data structure is finalized.
          </p>
        </div>
      </div>
    </div>
  )
} 