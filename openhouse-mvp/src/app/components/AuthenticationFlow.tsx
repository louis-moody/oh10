'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { ConnectButton } from './ConnectButton'
import { ProfileCompleteModal } from './ProfileCompleteModal'
import { DarkModeToggle } from './DarkModeToggle'
import { Shield } from 'lucide-react'

interface UserProfile {
  wallet_address: string
  name?: string
  email?: string
  profile_completed: boolean
  marketing_consent?: boolean
  is_admin?: boolean
}

export function AuthenticationFlow() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/user-profile', {
          credentials: 'include'
        })
        
        if (response.ok) {
          const userData = await response.json()
          setCurrentUser(userData.user)
        } else {
          setCurrentUser(null)
        }
      } catch {
        setCurrentUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuthStatus()
  }, [])

  // fix: check profile completion when user changes (Cursor Rule 4)
  useEffect(() => {
    const checkProfileCompletion = async () => {
      if (!currentUser?.wallet_address) return

      try {
        const response = await fetch('/api/user-profile', {
          credentials: 'include'
        })
        
        if (response.ok) {
          const userData = await response.json()
          
          if (!userData.user.profile_completed) {
            setShowProfileModal(true)
          } else {
            setShowProfileModal(false)
          }
        }
              } catch {
          // Silent error handling for profile check
      }
    }

    checkProfileCompletion()
  }, [currentUser])

  const handleAuthSuccess = (walletAddress: string) => {
    if (walletAddress) {
      // fix: refresh user data after successful authentication (Cursor Rule 4)
      const refreshUserData = async () => {
        try {
          const response = await fetch('/api/user-profile', {
            credentials: 'include'
          })
          
          if (response.ok) {
            const userData = await response.json()
            setCurrentUser(userData.user)
          }
        } catch {
          // Silent error handling for user data refresh
        }
      }
      
      refreshUserData()
    } else {
      setCurrentUser(null)
      setShowProfileModal(false)
    }
  }

  const handleProfileComplete = async (profileData: { name: string; email: string; marketingConsent: boolean }) => {
    try {
      const response = await fetch('/api/profile-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(profileData)
      })

      if (response.ok) {
        const result = await response.json()
        setCurrentUser(result.user)
        setShowProfileModal(false)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to complete profile')
      }
    } catch (error) {
      throw error // Re-throw to let the modal handle the error display
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* fix: show admin link if user is authenticated and is admin (Cursor Rule 5) */}
      {!isLoading && currentUser?.is_admin && (
        <Link 
          href="/admin" 
          className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Shield className="h-4 w-4" />
          Admin
        </Link>
      )}
      
      <DarkModeToggle />
      <ConnectButton onAuthSuccess={handleAuthSuccess} />
      
      {showProfileModal && currentUser && (
        <ProfileCompleteModal
          isOpen={showProfileModal}
          onComplete={handleProfileComplete}
          walletAddress={currentUser.wallet_address}
        />
      )}
    </div>
  )
} 