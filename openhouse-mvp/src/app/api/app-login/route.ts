import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'
import { SiweMessage } from 'siwe'
import { randomUUID } from 'crypto'

interface LoginRequest {
  message: string
  signature: string
}

export async function POST(request: NextRequest) {
  try {
    const { message, signature }: LoginRequest = await request.json()

    if (!message || !signature) {
      return NextResponse.json(
        { error: 'Message and signature are required' },
        { status: 400 }
      )
    }

    // fix: verify SIWE message signature (Cursor Rule 5)
    const siweMessage = new SiweMessage(message)
    console.log('SIWE message:', message)
    console.log('Signature:', signature)
    
    const fields = await siweMessage.verify({ signature })
    console.log('SIWE verification result:', fields)

    if (!fields.success) {
      console.error('SIWE verification failed:', fields.error)
      return NextResponse.json(
        { error: 'Invalid signature', details: fields.error?.type || 'Unknown SIWE error' },
        { status: 401 }
      )
    }

    const walletAddress = siweMessage.address.toLowerCase()

    // fix: use service role key for server-side operations (Cursor Rule 3)
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      )
    }

    // fix: create or update user record with updated_at support (Cursor Rule 4)
    const { error: userError, data: userData } = await supabaseAdmin
      .from('users')
      .upsert({
        wallet_address: walletAddress,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()

    if (userError) {
      console.error('User creation error:', userError)
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500 }
      )
    }

    if (!userData || userData.length === 0) {
      return NextResponse.json(
        { error: 'Failed to retrieve user record' },
        { status: 500 }
      )
    }

    const userId = userData[0].id

    // fix: create session record with enhanced schema (Cursor Rule 4)
    const sessionId = randomUUID()
    const jwtId = randomUUID() // JWT identifier for session tracking
    
    const { error: sessionError } = await supabaseAdmin
      .from('active_sessions')
      .insert({
        id: sessionId,
        user_id: userId,
        jwt_id: jwtId,
        wallet_address: walletAddress, // Direct wallet address for efficient lookup
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        created_at: new Date().toISOString(),
        revoked: false
      })
      .select()

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    // fix: sign JWT with session data (Cursor Rule 3)
    const token = await signJWT({
      wallet_address: walletAddress,
      session_id: sessionId
    })

    // fix: set secure HttpOnly cookie (Cursor Rule 3)
    const response = NextResponse.json({ 
      success: true,
      wallet_address: walletAddress 
    })

    response.cookies.set('app-session-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/'
    })
    
    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Authentication failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 