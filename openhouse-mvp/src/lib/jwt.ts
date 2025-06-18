import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.APP_SESSION_JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('APP_SESSION_JWT_SECRET environment variable is required')
}

// fix: ensure JWT_SECRET is treated as string for TypeScript (Cursor Rule 6)
const secret: string = JWT_SECRET

export interface JWTPayload {
  wallet_address: string
  session_id: string
  iat?: number
  exp?: number
}

export function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, secret, {
    expiresIn: '24h', // fix: short-lived JWT as per OpenHouse rules (Rule 3)
    algorithm: 'HS256'
  })
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256']
    }) as jwt.JwtPayload & JWTPayload
    
    return {
      wallet_address: decoded.wallet_address,
      session_id: decoded.session_id,
      iat: decoded.iat,
      exp: decoded.exp
    }
  } catch (error) {
    // fix: fail silently for invalid tokens, no logging of sensitive data (Rule 3)
    console.error('JWT verification failed:', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
} 