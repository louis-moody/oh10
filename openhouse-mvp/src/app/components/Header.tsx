'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ConnectButton } from './ConnectButton'
import { ProfileCompleteModal } from './ProfileCompleteModal'

interface UserProfile {
  wallet_address: string
  name?: string
  email?: string
  profile_completed: boolean
  marketing_consent?: boolean
  is_admin?: boolean
}

export function Header() {
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
      throw error
    }
  }

  return (
    <>
      <header className="bg-openhouse-bg/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-0 py-2 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/"><Image src="/images/Logo-Full.svg" alt="OpenHouse" width={150} height={100} /></Link>
          </div>
          
          <div className="flex items-center gap-4">
            <ConnectButton onAuthSuccess={handleAuthSuccess} />
          </div>
        </div>
      </header>

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