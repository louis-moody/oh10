import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

interface ProfileCompleteRequest {
  name: string
  email: string
  marketingConsent: boolean
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Profile Complete Route Called')
    
    // fix: validate JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value

    if (!token) {
      console.log('❌ No session token found')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = verifyJWT(token)
    if (!payload) {
      console.log('❌ Invalid session token')
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    const walletAddress = payload.wallet_address
    console.log('🎯 Profile completion for wallet:', walletAddress)

    // fix: validate request payload (Cursor Rule 6)
    const { name, email, marketingConsent }: ProfileCompleteRequest = await request.json()
    console.log('📝 Profile data:', { nameLength: name?.length, emailLength: email?.length, marketingConsent })

    if (!name?.trim() || !email?.trim()) {
      console.log('❌ Missing required profile data')
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // fix: validate email format (Cursor Rule 6)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      console.log('❌ Invalid email format')
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      console.log('❌ Supabase admin client not initialized')
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: update user profile with name, email, and marketing consent (Cursor Rule 4)
    console.log('📊 Updating user profile...')
    const { error: updateError, data: userData } = await supabaseAdmin
      .from('users')
      .update({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        marketing_consent: marketingConsent,
        profile_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress)
      .select()

    if (updateError) {
      console.error('❌ Profile update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    if (!userData || userData.length === 0) {
      console.log('❌ User not found for wallet:', walletAddress)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    console.log('✅ Profile completed successfully:', userData[0])

    return NextResponse.json({
      success: true,
      user: {
        id: userData[0].id,
        wallet_address: userData[0].wallet_address,
        name: userData[0].name,
        email: userData[0].email,
        profile_completed: userData[0].profile_completed,
        marketing_consent: userData[0].marketing_consent
      }
    })

  } catch (error) {
    console.error('💥 Profile completion error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 