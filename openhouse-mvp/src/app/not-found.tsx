import Link from 'next/link'
import { Building2, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-openhouse-bg flex items-center justify-center">
      <div className="text-center">
        <div className="flex items-center justify-center mb-6">
          <Building2 className="w-12 h-12 text-openhouse-fg-muted" />
        </div>
        <h1 className="font-heading text-4xl font-bold text-openhouse-fg mb-2">
          404
        </h1>
        <h2 className="font-heading text-xl font-semibold text-openhouse-fg mb-4">
          Page Not Found
        </h2>
        <p className="text-openhouse-fg-muted mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-openhouse-accent text-openhouse-accent-fg rounded-lg hover:bg-openhouse-accent/90 transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  )
} 