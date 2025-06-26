'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ConnectButton } from './ConnectButton'
import { ProfileCompleteModal } from './ProfileCompleteModal'
import { DarkModeToggle } from './DarkModeToggle'
import { Shield, LogOut, X, Home, Wallet as WalletIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

interface UserProfile {
  wallet_address: string
  name?: string
  email?: string
  profile_completed: boolean
  marketing_consent?: boolean
  is_admin?: boolean
}

// fix: generate random gradient colors for avatar (Cursor Rule 7)
const generateGradient = (address: string) => {
  const colors = [
    'from-pink-500 to-violet-500',
    'from-blue-500 to-cyan-500', 
    'from-green-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-purple-500 to-pink-500',
    'from-indigo-500 to-blue-500',
    'from-yellow-500 to-orange-500',
    'from-teal-500 to-green-500'
  ]
  
  // fix: use wallet address to consistently generate same gradient (Cursor Rule 4)
  const hash = address.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  
  return colors[Math.abs(hash) % colors.length]
}

export function Header() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showSideMenu, setShowSideMenu] = useState(false)
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

  const handleDisconnect = async () => {
    try {
      // fix: logout API call to clear session (Cursor Rule 3)
      await fetch('/api/app-logout', {
        method: 'POST'
      })

      handleAuthSuccess('')
      setShowSideMenu(false)
    } catch {
      // fix: still update state even if API fails (Cursor Rule 6)
      handleAuthSuccess('')
      setShowSideMenu(false)
    }
  }

  return (
    <>
      <header className="bg-openhouse-bg/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/"><Image src="/images/Logo-Full.svg" alt="OpenHouse" width={150} height={100} /></Link>
          </div>
          
          <div className="flex items-center gap-4">
            {/* fix: show gradient avatar when connected, connect button when not (Cursor Rule 7) */}
            {!isLoading && currentUser?.wallet_address ? (
              <button
                onClick={() => setShowSideMenu(true)}
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${generateGradient(currentUser.wallet_address)} hover:scale-105 transition-transform duration-200 border-2 border-openhouse-border/20`}
                aria-label="Open menu"
              />
            ) : (
              <ConnectButton onAuthSuccess={handleAuthSuccess} />
            )}
          </div>
        </div>
      </header>

      {/* fix: side menu modal for connected users (Cursor Rule 7) */}
      <Dialog open={showSideMenu} onOpenChange={setShowSideMenu}>
        <DialogContent className="sm:max-w-sm p-0 gap-0">
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-openhouse-border/20">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${currentUser?.wallet_address ? generateGradient(currentUser.wallet_address) : 'from-gray-400 to-gray-600'}`} />
                <div className="text-sm">
                  <div className="font-medium text-openhouse-fg">
                    {currentUser?.wallet_address?.slice(0, 6)}...{currentUser?.wallet_address?.slice(-4)}
                  </div>
                  <div className="text-openhouse-fg-muted">
                    {currentUser?.name || 'Connected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-6 space-y-2">
              {/* fix: navigation links (Cursor Rule 7) */}
              <Link 
                href="/" 
                className="flex items-center gap-3 px-3 py-3 text-openhouse-fg hover:bg-openhouse-bg-secondary rounded-lg transition-colors w-full"
                onClick={() => setShowSideMenu(false)}
              >
                <Home className="h-5 w-5" />
                <span>Properties</span>
              </Link>
              
              <Link 
                href="/wallet" 
                className="flex items-center gap-3 px-3 py-3 text-openhouse-fg hover:bg-openhouse-bg-secondary rounded-lg transition-colors w-full"
                onClick={() => setShowSideMenu(false)}
              >
                <WalletIcon className="h-5 w-5" />
                <span>Wallet</span>
              </Link>

              {/* fix: show admin link if user is admin (Cursor Rule 5) */}
              {currentUser?.is_admin && (
                <Link 
                  href="/admin" 
                  className="flex items-center gap-3 px-3 py-3 text-openhouse-fg hover:bg-openhouse-bg-secondary rounded-lg transition-colors w-full"
                  onClick={() => setShowSideMenu(false)}
                >
                  <Shield className="h-5 w-5" />
                  <span>Admin</span>
                </Link>
              )}
              
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-3 px-3 py-3 text-openhouse-fg hover:bg-openhouse-bg-secondary rounded-lg transition-colors w-full text-left"
              >
                <LogOut className="h-5 w-5" />
                <span>Disconnect</span>
              </button>

              {/* fix: dark mode toggle in menu (Cursor Rule 7) */}
              <DarkModeToggle />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* fix: profile completion modal (Cursor Rule 7) */}
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