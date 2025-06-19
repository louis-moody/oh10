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
    // fix: validate JWT token from cookie (Cursor Rule 3)
    const token = request.cookies.get('app-session-token')?.value
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const payload = await verifyJWT(token)
    if (!payload || !payload.wallet_address) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    const walletAddress = payload.wallet_address.toLowerCase()

    const { name, email, marketingConsent }: ProfileCompleteRequest = await request.json()

    // fix: validate required profile data (Cursor Rule 6)
    if (!name || !email || typeof marketingConsent !== 'boolean') {
      return NextResponse.json(
        { error: 'Name, email, and marketing consent are required' },
        { status: 400 }
      )
    }

    // fix: basic email validation (Cursor Rule 6)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      )
    }

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: update user profile using proper schema (Cursor Rule 4)
    const { error: updateError, data: userData } = await supabaseAdmin
      .from('users')
      .update({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        marketing_consent: marketingConsent,
        profile_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress)
      .select()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    if (!userData || userData.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: userData[0],
      message: 'Profile completed successfully'
    })

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 