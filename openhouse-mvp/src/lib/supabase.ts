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
  status: 'active' | 'funded' | 'completed' | 'draft' | 'live'
  created_at: string
  updated_at: string
}

export interface PropertyWithProgress extends Property {
  raised_amount: number
  progress_percentage: number
}

// fix: clean property token details for pure orderbook trading (Cursor Rule 4)
export interface PropertyTokenDetails {
  id: string
  property_id: string
  contract_address: string
  token_name: string
  token_symbol: string
  total_shares: number
  available_shares?: number
  orderbook_contract_address?: string
  yield_distributor_address?: string
  total_supply: number
  price_source: 'openhouse' | 'last_trade'
  created_at: string
  updated_at: string
}

// fix: property details table for property page tabs (Cursor Rule 4)
export interface PropertyDetails {
  id: string
  property_id: string
  property_type: string
  bedrooms: number
  bathrooms: number
  square_footage: number
  full_address: string
  postcode: string
  city: string
  ownership_model: string
  lease_information?: string
  amenities?: string[]
  developer_info?: string
  created_at: string
  updated_at: string
}

// fix: property financials table for property page tabs (Cursor Rule 4)
export interface PropertyFinancials {
  property_id: string
  price_per_share: number
  monthly_income: number
  annual_return: number
  property_value: number
  cash_on_cash: number
  cap_rate: number
  roi: number
  gross_rent_multiplier: number
  net_operating_income: number
  expense_ratio: number
  vacancy_rate: number
  break_even_ratio: number
  annual_yield_pct: number
}

// fix: property activity table for property page tabs (Cursor Rule 4)
export interface PropertyActivity {
  id: string
  property_id: string
  activity_type: 'buy_order' | 'sell_order' | 'trade_executed' | 'yield_distributed'
  wallet_address: string
  share_count?: number
  price_per_share?: number
  total_amount?: number
  transaction_hash?: string
  block_number?: number
  created_at: string
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

// fix: clean transaction type for pure orderbook trading (Cursor Rule 4)
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
  execution_source: 'orderbook'
  created_at: string
  updated_at: string
}

// fix: enhanced user holdings with ownership tracking (Cursor Rule 4)
export interface UserHolding {
  id: string
  user_id: string
  property_id: string
  shares: number
  acquisition_price: number
  acquisition_source?: 'purchase' | 'transfer'
  acquired_at: string
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

// fix: clean trading interface types for pure orderbook (Cursor Rule 4)
export interface TradeEstimate {
  input_amount: number
  output_amount: number
  price_per_token: number
  protocol_fee: number
  total_fee: number
  net_amount: number
  execution_method: 'orderbook'
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

export const supabaseHelpers = {
  // ... existing code ...

  // fix: remove shouldUseFallback function (Cursor Rule 15)
  // All fallback logic has been removed from the system
} 