'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { Mail, User, CheckCircle, Loader2 } from 'lucide-react'

interface ProfileCompleteModalProps {
  isOpen: boolean
  onComplete: (data: { name: string; email: string; marketingConsent: boolean }) => Promise<void>
  walletAddress: string
}

export function ProfileCompleteModal({ isOpen, onComplete, walletAddress }: ProfileCompleteModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})

  const validateForm = () => {
    const newErrors: { name?: string; email?: string } = {}
    
    if (!name.trim()) {
      newErrors.name = 'Name is required'
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await onComplete({
        name: name.trim(),
        email: email.trim(),
        marketingConsent
      })
    } catch (error) {

      // Handle error - could show toast notification
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-openhouse-success/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-openhouse-success" />
          </div>
          
          <DialogTitle className="text-xl font-heading font-semibold text-openhouse-fg">
            Welcome to OpenHouse
          </DialogTitle>
          
          <div className="space-y-1">
            <p className="text-openhouse-fg-muted text-sm">
              Connected as {formatWalletAddress(walletAddress)}
            </p>
            <p className="text-openhouse-fg-muted text-sm">
              Complete your profile to get started with tokenized real estate investment
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-openhouse-fg">
              Full Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-openhouse-fg-muted" />
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className={`pl-10 ${errors.name ? 'border-openhouse-danger' : ''}`}
                disabled={isSubmitting}
              />
            </div>
            {errors.name && (
              <p className="text-sm text-openhouse-danger">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-openhouse-fg">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-openhouse-fg-muted" />
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                className={`pl-10 ${errors.email ? 'border-openhouse-danger' : ''}`}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-openhouse-danger">{errors.email}</p>
            )}
          </div>

          <div className="flex items-start space-x-3 p-4 bg-openhouse-bg/50 rounded-lg border border-openhouse-border/20">
            <Checkbox
              id="marketing"
              checked={marketingConsent}
              onCheckedChange={(checked: boolean) => setMarketingConsent(checked)}
              disabled={isSubmitting}
            />
            <div className="space-y-1">
              <Label 
                htmlFor="marketing" 
                className="text-sm font-medium text-openhouse-fg cursor-pointer"
              >
                Stay informed about opportunities
              </Label>
              <p className="text-xs text-openhouse-fg-muted">
                Get notified about new properties, crowdfunding campaigns, and platform updates. 
                You can unsubscribe at any time.
              </p>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing Profile...
              </>
            ) : (
              'Complete Profile'
            )}
          </Button>
        </form>

        <p className="text-xs text-center text-openhouse-fg-muted mt-4">
          By completing your profile, you agree to our Terms of Service and Privacy Policy.
        </p>
      </DialogContent>
    </Dialog>
  )
} 