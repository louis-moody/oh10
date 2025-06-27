'use client'

import React from 'react'
import { Button } from './ui/button'

export function Hero() {
  return (
    <section className="py-16 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Text Content */}
          <div className="space-y-8">
            {/* APY Badge */}
            <div className="inline-flex items-center px-4 py-2 bg-openhouse-success/10 text-openhouse-success rounded-full text-sm font-medium">
              8 - 18% APY on DeFi Real Estate Yields
            </div>
            
            {/* Main Heading */}
            <h1 className="font-title text-4xl md:text-6xl font-semibold text-openhouse-fg leading-tight">
              Build your legacy.
            </h1>
            
            {/* Description */}
            <p className="text-lg md:text-xl text-openhouse-fg-muted max-w-lg leading-relaxed">
              Real estate investing, as intuitive as trading a share. At OpenHouse, 
              every token you buy is your stake in a place where futures grow, 
              and your story unfolds.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-lg px-8 py-6">
                View Properties
              </Button>
              
              {/* Built on Base Badge */}
              <div className="flex items-center gap-3 px-6 py-3 bg-openhouse-bg-muted rounded-lg">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-openhouse-fg">Built on Base</p>
                  <p className="text-xs text-openhouse-fg-muted">By Coinbase</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Side - Video */}
          <div className="relative">
            <div className="relative rounded-lg overflow-hidden aspect-[4/3] bg-openhouse-bg-muted">
              <video
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="/videos/hero-background.mp4" type="video/mp4" />
              </video>
              
              {/* Subtle overlay for better contrast */}
              <div className="absolute inset-0 bg-black/5"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 