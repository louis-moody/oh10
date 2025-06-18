import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Calendar, DollarSign } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import type { PropertyWithProgress } from '@/lib/supabase'

interface PropertyCardProps {
  property: PropertyWithProgress
}

export function PropertyCard({ property }: PropertyCardProps) {
  const {
    id,
    name,
    image_url,
    price_per_token,
    funding_deadline,
    status,
    raised_amount,
    funding_goal_usdc,
    progress_percentage
  } = property

  const statusColors = {
    active: 'bg-openhouse-success/10 text-openhouse-success border-openhouse-success/20',
    funded: 'bg-openhouse-accent/10 text-openhouse-accent border-openhouse-accent/20',
    completed: 'bg-openhouse-fg-muted/10 text-openhouse-fg-muted border-openhouse-fg-muted/20',
    draft: 'bg-openhouse-warning/10 text-openhouse-warning border-openhouse-warning/20'
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

  return (
    <Card className="group h-full overflow-hidden bg-card border-border/50 hover:border-border transition-all duration-200 hover:shadow-sm">
      <Link href={`/properties/${id}`} className="block h-full">
        <div className="aspect-[4/3] relative overflow-hidden bg-openhouse-bg-muted">
          {image_url ? (
            <Image
              src={image_url}
              alt={name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
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
            <Badge className={statusColors[status]} variant="outline">
              {status}
            </Badge>
          </div>
        </div>

        <CardHeader className="pb-2">
          <h3 className="font-heading text-lg font-semibold text-openhouse-fg group-hover:text-openhouse-accent transition-colors line-clamp-2">
            {name}
          </h3>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-openhouse-fg-muted">Price per token</p>
              <p className="font-semibold text-openhouse-fg">
                {formatCurrency(price_per_token)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-openhouse-fg-muted">Progress</p>
              <p className="font-semibold text-openhouse-fg">
                {progress_percentage}%
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-openhouse-fg-muted">
              <span>Raised</span>
              <span>{formatCurrency(raised_amount)} of {formatCurrency(funding_goal_usdc)}</span>
            </div>
            <div className="w-full bg-openhouse-bg-muted rounded-full h-2">
              <div 
                className="bg-openhouse-success h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress_percentage, 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-openhouse-fg-muted">
            <Calendar className="w-4 h-4" />
            <span>Ends {formatDeadline(funding_deadline)}</span>
          </div>

          <Button 
            variant="outline" 
            className="w-full group-hover:bg-openhouse-accent group-hover:text-openhouse-accent-fg group-hover:border-openhouse-accent transition-all"
          >
            View Details
          </Button>
        </CardContent>
      </Link>
    </Card>
  )
} 