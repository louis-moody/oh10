'use client'

import React, { useState, useEffect } from 'react'
import { ConnectButton } from './ConnectButton'
import { ProfileCompleteModal } from './ProfileCompleteModal'

interface AuthenticationFlowProps {
  onAuthComplete?: (user: { wallet_address: string; name?: string; email?: string; profile_completed: boolean }) => void
}

interface UserProfile {
  wallet_address: string
  name?: string
  email?: string
  profile_completed: boolean
  marketing_consent?: boolean
}

export function AuthenticationFlow({ onAuthComplete }: AuthenticationFlowProps) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [isCheckingProfile, setIsCheckingProfile] = useState(false)

  // fix: check if user profile is complete after authentication (Cursor Rule 4)
  const checkUserProfile = async (walletAddress: string) => {
    try {
      setIsCheckingProfile(true)
      console.log('🔍 Checking profile completion for:', walletAddress)

      // fix: call backend to check profile status (Cursor Rule 4)
      const response = await fetch('/api/user-profile', {
        method: 'GET',
        credentials: 'include' // Include cookies for authentication
      })

      if (response.ok) {
        const userData = await response.json()
        console.log('📊 User profile data:', userData)
        
        setCurrentUser(userData.user)
        
        // fix: show profile modal if profile is not complete (Cursor Rule 4)
        if (!userData.user.profile_completed) {
          console.log('📝 Profile incomplete, showing completion modal')
          setShowProfileModal(true)
        } else {
          console.log('✅ Profile already complete')
          onAuthComplete?.(userData.user)
        }
      } else {
        console.error('❌ Failed to fetch user profile')
        // fix: still show profile modal if we can't determine status (Cursor Rule 6)
        setCurrentUser({ wallet_address: walletAddress, profile_completed: false })
        setShowProfileModal(true)
      }
    } catch (error) {
      console.error('💥 Error checking user profile:', error)
      // fix: fallback to showing profile modal (Cursor Rule 6)
      setCurrentUser({ wallet_address: walletAddress, profile_completed: false })
      setShowProfileModal(true)
    } finally {
      setIsCheckingProfile(false)
    }
  }

  // fix: handle successful wallet authentication (Cursor Rule 5)
  const handleAuthSuccess = async (walletAddress: string) => {
    if (!walletAddress) {
      // User disconnected
      setCurrentUser(null)
      setShowProfileModal(false)
      onAuthComplete?.(null as any)
      return
    }

    console.log('🎉 Wallet authentication successful:', walletAddress)
    await checkUserProfile(walletAddress)
  }

  // fix: handle profile completion (Cursor Rule 4)
  const handleProfileComplete = async (profileData: { name: string; email: string; marketingConsent: boolean }) => {
    if (!currentUser) return

    try {
      console.log('📝 Completing user profile...')
      
      const response = await fetch('/api/profile-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(profileData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete profile')
      }

      const result = await response.json()
      console.log('✅ Profile completed successfully:', result.user)

      // fix: update current user and close modal (Cursor Rule 7)
      setCurrentUser(result.user)
      setShowProfileModal(false)
      onAuthComplete?.(result.user)

    } catch (error) {
      console.error('💥 Profile completion error:', error)
      throw error // Re-throw to let the modal handle the error display
    }
  }

  return (
    <>
      <ConnectButton onAuthSuccess={handleAuthSuccess} />
      
      {showProfileModal && currentUser && (
        <ProfileCompleteModal
          isOpen={showProfileModal}
          onComplete={handleProfileComplete}
          walletAddress={currentUser.wallet_address}
        />
      )}
    </>
  )
} 