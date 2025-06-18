import React from 'react'
import { Card, CardContent, CardHeader } from './ui/card'

interface LoadingStateProps {
  count?: number
}

function SkeletonCard() {
  return (
    <Card className="h-full overflow-hidden bg-card border-border/50">
      <div className="aspect-[4/3] bg-openhouse-bg-muted animate-pulse" />
      <CardHeader className="pb-2">
        <div className="h-6 bg-openhouse-bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-openhouse-bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-openhouse-bg-muted rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 bg-openhouse-bg-muted rounded animate-pulse" />
            <div className="h-4 w-10 bg-openhouse-bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <div className="h-3 w-12 bg-openhouse-bg-muted rounded animate-pulse" />
            <div className="h-3 w-24 bg-openhouse-bg-muted rounded animate-pulse" />
          </div>
          <div className="w-full bg-openhouse-bg-muted rounded-full h-2 animate-pulse" />
        </div>
        <div className="h-3 w-32 bg-openhouse-bg-muted rounded animate-pulse" />
        <div className="h-10 w-full bg-openhouse-bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}

export function LoadingState({ count = 6 }: LoadingStateProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  )
} 