import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('app-session-token')?.value

    if (token) {
      const payload = verifyJWT(token)
      
      if (payload && supabaseAdmin) {
        // fix: remove session from database using wallet address (Cursor Rule 4)
        await supabaseAdmin
          .from('active_sessions')
          .delete()
          .eq('id', payload.session_id)
          .eq('wallet_address', payload.wallet_address)
      }
    }

    // fix: clear session cookie (Cursor Rule 3)
    const response = NextResponse.json({ success: true })
    
    response.cookies.set('app-session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Logout error:', error)
    
    // fix: still clear cookie even if database operation fails (Cursor Rule 3)
    const response = NextResponse.json({ success: true })
    response.cookies.set('app-session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    })

    return response
  }
} 