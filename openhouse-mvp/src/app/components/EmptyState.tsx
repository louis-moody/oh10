import React from 'react'
import { Building2 } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  description?: string
}

export function EmptyState({ 
  title = "No properties available", 
  description = "Check back soon for new investment opportunities." 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-openhouse-bg-muted flex items-center justify-center mb-4">
        <Building2 className="w-8 h-8 text-openhouse-fg-muted" />
      </div>
      <h3 className="font-heading text-lg font-semibold text-openhouse-fg mb-2">
        {title}
      </h3>
      <p className="text-openhouse-fg-muted max-w-sm">
        {description}
      </p>
    </div>
  )
} 