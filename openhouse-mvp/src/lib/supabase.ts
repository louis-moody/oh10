import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// fix: handle missing environment variables gracefully for build process (Cursor Rule 6)
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// fix: service role client for server-side operations (Cursor Rule 3)
export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

// Types for the properties table
export interface Property {
  id: string
  name: string
  image_url: string | null
  price_per_token: number
  total_shares: number
  funding_goal_usdc: number
  funding_deadline: string
  status: 'active' | 'funded' | 'completed' | 'draft'
  created_at: string
  updated_at: string
}

export interface PropertyWithProgress extends Property {
  raised_amount: number
  progress_percentage: number
} 