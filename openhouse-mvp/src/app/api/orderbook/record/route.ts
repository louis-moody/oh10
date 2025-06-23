import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: REAL ORDERBOOK SYNC - record on-chain orders in Supabase (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies()
    const token = cookieStore.get('app-session-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const decoded = await verifyJWT(token)
    if (!decoded || !decoded.wallet_address) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    }

    const body = await req.json()
    const { 
      property_id, 
      order_type, 
      user_address, 
      shares, 
      price_per_share, 
      transaction_hash, 
      contract_address 
    } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id || !order_type || !user_address || !shares || !price_per_share || !transaction_hash || !contract_address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(order_type)) {
      return NextResponse.json({ error: 'Invalid order type' }, { status: 400 })
    }

    // fix: verify user matches authenticated wallet (Cursor Rule 3)
    if (user_address.toLowerCase() !== decoded.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: 'User address mismatch' }, { status: 403 })
    }

    // fix: verify property exists and has matching contract address (Cursor Rule 4)
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('property_id, orderbook_contract_address')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (propertyDetails.orderbook_contract_address?.toLowerCase() !== contract_address.toLowerCase()) {
      return NextResponse.json({ error: 'Contract address mismatch' }, { status: 400 })
    }

    // fix: insert order into order_book table with contract ID mapping (Cursor Rule 4)
    const orderData = {
      property_id,
      order_type,
      user_address: user_address.toLowerCase(),
      shares: parseFloat(shares),
      price_per_share: parseFloat(price_per_share),
      shares_remaining: parseFloat(shares), // Initially all shares are remaining
      status: 'open',
      transaction_hash: transaction_hash.toLowerCase(),
      contract_address: contract_address.toLowerCase(),
      created_at: new Date().toISOString()
    }

    // fix: get contract order ID from transaction logs (Cursor Rule 4)
    let contractOrderId: number | null = null
    try {
      // Parse transaction logs to get the OrderCreated event
      const ethers = await import('ethers')
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL)
      const receipt = await provider.getTransactionReceipt(transaction_hash)
      
      if (receipt && receipt.logs) {
        // fix: OrderCreated event signature: OrderCreated(uint256 indexed orderId, address indexed creator, uint8 indexed orderType, uint256 tokenAmount, uint256 pricePerToken, uint256 timestamp)
        const orderCreatedTopic = ethers.id('OrderCreated(uint256,address,uint8,uint256,uint256,uint256)')
        const orderLog = receipt.logs.find((log) => 
          log.address.toLowerCase() === contract_address.toLowerCase() &&
          log.topics[0] === orderCreatedTopic
        )
        
        if (orderLog && orderLog.topics[1]) {
          // Extract order ID from indexed parameter (uint256)
          contractOrderId = parseInt(orderLog.topics[1], 16)
        }
      }
    } catch (error) {
      console.warn('Could not extract contract order ID from logs:', error)
    }

    // fix: add contract_order_id to database record (Cursor Rule 4)
    const finalOrderData = contractOrderId 
      ? { ...orderData, contract_order_id: contractOrderId }
      : orderData

    const { data: orderRecord, error: insertError } = await supabaseAdmin
      .from('order_book')
      .insert(finalOrderData)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to insert order:', insertError)
      return NextResponse.json({ error: 'Failed to record order' }, { status: 500 })
    }

    console.log('✅ Order recorded successfully:', orderRecord.id, 'Contract ID:', contractOrderId)

    // fix: activity recording removed - using order_book table as source of truth (Cursor Rule 4)
    console.log('✅ Order recorded in order_book table - activity will be shown from there')

    return NextResponse.json({
      success: true,
      order_id: orderRecord.id,
      message: 'Order recorded successfully'
    })

  } catch (error) {
    console.error('Orderbook record error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 