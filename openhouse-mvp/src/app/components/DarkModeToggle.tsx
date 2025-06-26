'use client'

import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  // fix: prevent hydration mismatch by waiting for client mount (Cursor Rule 6)
  useEffect(() => {
    setMounted(true)
    
    // Check for saved preference or default to system preference
    const savedTheme = localStorage.getItem('openhouse-theme')
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark)
    
    setIsDark(shouldUseDark)
    updateTheme(shouldUseDark)
  }, [])

  const updateTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const toggleTheme = () => {
    const newDarkMode = !isDark
    setIsDark(newDarkMode)
    updateTheme(newDarkMode)
    localStorage.setItem('openhouse-theme', newDarkMode ? 'dark' : 'light')
  }

  // fix: prevent flash of unstyled content during SSR (Cursor Rule 3)
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-openhouse-fg-muted"
        disabled
      >
        <span className="text-sm">Dark Mode</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="gap-2 text-openhouse-fg-muted hover:text-openhouse-fg transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="text-sm">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </Button>
  )
} 