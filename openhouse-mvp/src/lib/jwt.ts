// fix: use jose library for Edge Runtime compatibility (Cursor Rule 6)
import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = process.env.APP_SESSION_JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('APP_SESSION_JWT_SECRET environment variable is required')
}

// fix: convert secret to Uint8Array for jose (Cursor Rule 6)
const secret = new TextEncoder().encode(JWT_SECRET)

export interface JWTPayload {
  wallet_address: string
  session_id: string
  iat?: number
  exp?: number
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // fix: short-lived JWT as per OpenHouse rules (Rule 3)
    .sign(secret)
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256']
    })
    
    return {
      wallet_address: payload.wallet_address as string,
      session_id: payload.session_id as string,
      iat: payload.iat,
      exp: payload.exp
    }
  } catch (error) {
    // fix: fail silently for invalid tokens, no logging of sensitive data (Rule 3)
    console.error('JWT verification failed:', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
} 