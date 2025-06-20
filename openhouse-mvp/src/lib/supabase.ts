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

// fix: enhanced property token details with pricing and fallback support (Cursor Rule 4)
export interface PropertyTokenDetails {
  id: number
  property_id: string
  contract_address: string
  token_name: string
  token_symbol: string
  total_shares: number
  deployment_hash: string
  treasury_address: string
  operator_address: string
  funding_goal_usdc: number
  funding_deadline: string
  price_per_token: number
  deployment_timestamp: string
  orderbook_contract_address?: string
  // New fields for simplified trading
  current_price_usdc?: number
  price_last_updated_at?: string
  price_source?: 'openhouse' | 'market' | 'fallback'
  fallback_enabled?: boolean
  created_at: string
  updated_at: string
}

// fix: admin settings type for secure configuration (Cursor Rule 3)
export interface AdminSettings {
  id: number
  setting_key: string
  setting_value: string
  description?: string
  is_sensitive: boolean
  created_at: string
  updated_at: string
}

// fix: enhanced transaction type with fallback tracking (Cursor Rule 4)
export interface Transaction {
  id: number
  user_id: string
  property_id: number
  transaction_type: 'buy' | 'sell' | 'transfer'
  token_amount: number
  usdc_amount: number
  price_per_token: number
  transaction_hash: string
  status: 'pending' | 'completed' | 'failed'
  // New fields for simplified trading
  execution_source?: 'orderbook' | 'fallback'
  fallback_reason?: string
  original_price_usdc?: number
  executed_price_usdc?: number
  slippage_bps?: number
  created_at: string
  updated_at: string
}

// fix: enhanced user holdings with ownership tracking (Cursor Rule 4)
export interface UserHoldings {
  id: number
  user_id: string
  property_id: number
  token_contract: string
  shares: number
  // New fields for simplified trading
  owner_type?: 'user' | 'protocol' | 'treasury'
  acquisition_source?: 'purchase' | 'fallback' | 'transfer'
  last_updated_at?: string
  created_at: string
  updated_at: string
}

// fix: order book state tracking type (Cursor Rule 4)
export interface OrderBookState {
  id: number
  property_id: string
  orderbook_contract_address: string
  best_buy_price_usdc?: number
  best_sell_price_usdc?: number
  total_buy_volume: number
  total_sell_volume: number
  spread_percentage?: number
  last_trade_price_usdc?: number
  last_trade_timestamp?: string
  snapshot_timestamp: string
}

// fix: price history tracking type (Cursor Rule 4)
export interface PriceHistory {
  id: number
  property_id: string
  price_usdc: number
  price_source: 'openhouse' | 'last_trade' | 'fallback'
  volume_24h: number
  change_percentage_24h?: number
  recorded_at: string
}

// fix: simplified trading interface types (Cursor Rule 4)
export interface TradingPrice {
  current_price: number
  source: 'openhouse' | 'market' | 'fallback'
  last_updated: string
  fallback_available: boolean
}

export interface TradeEstimate {
  input_amount: number
  output_amount: number
  price_per_token: number
  protocol_fee: number
  total_fee: number
  net_amount: number
  execution_method: 'orderbook' | 'fallback'
  estimated_slippage?: number
}

// fix: fallback wallet configuration type (Cursor Rule 3)
export interface FallbackConfig {
  wallet_address: string
  max_slippage_bps: number
  timeout_seconds: number
  enabled: boolean
}

// fix: trading validation result type (Cursor Rule 6)
export interface TradingValidation {
  valid: boolean
  error?: string
  warnings?: string[]
  suggested_action?: string
}

// fix: helper functions for price management (Cursor Rule 4)
export const PriceUtils = {
  // Get current OpenHouse price for a property
  getCurrentPrice: async (propertyId: string): Promise<number | null> => {
    if (!supabase) return null
    
    try {
      const { data, error } = await supabase.rpc('get_current_openhouse_price', {
        target_property_id: propertyId
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Failed to get current price:', error)
      return null
    }
  },

  // Check if fallback should be used for a trade
  shouldUseFallback: async (
    propertyId: string, 
    tradeType: 'buy' | 'sell', 
    amountUsdc: number
  ): Promise<boolean> => {
    if (!supabase) return false
    
    try {
      const { data, error } = await supabase.rpc('should_use_fallback', {
        target_property_id: propertyId,
        trade_type: tradeType,
        amount_usdc: amountUsdc
      })
      
      if (error) throw error
      return data || false
    } catch (error) {
      console.error('Failed to check fallback status:', error)
      return false
    }
  },

  // Calculate trading fees and estimates
  calculateTradeEstimate: (
    inputAmount: number,
    pricePerToken: number,
    tradeType: 'buy' | 'sell',
    protocolFeeBps: number = 50 // 0.5%
  ): TradeEstimate => {
    const protocolFee = (inputAmount * protocolFeeBps) / 10000
    
    if (tradeType === 'buy') {
      // User inputs USDC, gets tokens
      const availableUsdc = inputAmount - protocolFee
      const outputTokens = availableUsdc / pricePerToken
      
      return {
        input_amount: inputAmount,
        output_amount: outputTokens,
        price_per_token: pricePerToken,
        protocol_fee: protocolFee,
        total_fee: protocolFee,
        net_amount: outputTokens,
        execution_method: 'orderbook'
      }
    } else {
      // User inputs tokens, gets USDC
      const grossUsdc = inputAmount * pricePerToken
      const netUsdc = grossUsdc - protocolFee
      
      return {
        input_amount: inputAmount,
        output_amount: netUsdc,
        price_per_token: pricePerToken,
        protocol_fee: protocolFee,
        total_fee: protocolFee,
        net_amount: netUsdc,
        execution_method: 'orderbook'
      }
    }
  }
} 