import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: SYNC MISSING CONTRACT ORDER IDs - repair orders with null contract_order_id (Cursor Rule 4)
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
    const { property_id } = body

    // fix: validate required fields (Cursor Rule 6)
    if (!property_id) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    console.log('🔄 SYNC: Starting contract order ID sync for property:', property_id)

    // fix: find orders missing contract_order_id (Cursor Rule 4)
    const { data: ordersNeedingSync, error: fetchError } = await supabaseAdmin
      .from('order_book')
      .select('*')
      .eq('property_id', property_id)
      .is('contract_order_id', null)
      .not('transaction_hash', 'is', null)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('❌ SYNC: Failed to fetch orders needing sync:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!ordersNeedingSync || ordersNeedingSync.length === 0) {
      console.log('✅ SYNC: No orders need contract_order_id sync')
      return NextResponse.json({
        success: true,
        orders_synced: 0,
        message: 'No orders need sync'
      })
    }

    console.log(`🔍 SYNC: Found ${ordersNeedingSync.length} orders needing contract_order_id sync`)

    // fix: get contract address for transaction verification (Cursor Rule 4)
    const { data: propertyDetails } = await supabaseAdmin
      .from('property_token_details')
      .select('orderbook_contract_address')
      .eq('property_id', property_id)
      .single()

    if (!propertyDetails?.orderbook_contract_address) {
      return NextResponse.json({ error: 'Orderbook contract address not found' }, { status: 404 })
    }

    const contractAddress = propertyDetails.orderbook_contract_address

    // fix: use multiple RPC endpoints with fallback (Cursor Rule 3)
    const ethers = await import('ethers')
    const rpcUrls = [
      process.env.NEXT_PUBLIC_BASE_RPC_URL,
      'https://sepolia.base.org',
      'https://base-sepolia.public.blastapi.io',
      'https://base-sepolia-rpc.publicnode.com'
    ].filter(Boolean)
    
    let provider = null
    
    // Try different RPC providers
    for (const rpcUrl of rpcUrls) {
      try {
        const testProvider = new ethers.JsonRpcProvider(rpcUrl)
        await testProvider.getBlockNumber()
        provider = testProvider
        console.log(`✅ SYNC: Connected to RPC: ${rpcUrl}`)
        break
      } catch (rpcError) {
        console.log(`❌ SYNC: RPC ${rpcUrl} failed:`, rpcError)
      }
    }
    
    if (!provider) {
      return NextResponse.json({ 
        error: 'All RPC endpoints failed',
        orders_needing_sync: ordersNeedingSync.length
      }, { status: 503 })
    }

    const syncedOrders = []
    const failedOrders = []

    // fix: process each order and try to extract contract_order_id (Cursor Rule 4)
    for (const order of ordersNeedingSync) {
      try {
        console.log(`🔍 SYNC: Processing order ${order.id} with transaction ${order.transaction_hash}`)
        
        const receipt = await provider.getTransactionReceipt(order.transaction_hash)
        
        if (receipt && receipt.logs) {
          // fix: OrderCreated event signature: OrderCreated(uint256 indexed orderId, address indexed creator, uint8 indexed orderType, uint256 tokenAmount, uint256 pricePerToken, uint256 timestamp)
          const orderCreatedTopic = ethers.id('OrderCreated(uint256,address,uint8,uint256,uint256,uint256)')
          const orderLog = receipt.logs.find((log) => 
            log.address.toLowerCase() === contractAddress.toLowerCase() &&
            log.topics[0] === orderCreatedTopic
          )
          
          if (orderLog && orderLog.topics[1]) {
            // Extract order ID from indexed parameter (uint256)
            const contractOrderId = parseInt(orderLog.topics[1], 16)
            
            console.log(`✅ SYNC: Found contract order ID ${contractOrderId} for order ${order.id}`)
            
            // Update the order in database
            const { error: updateError } = await supabaseAdmin
              .from('order_book')
              .update({ contract_order_id: contractOrderId })
              .eq('id', order.id)
            
            if (updateError) {
              console.error(`❌ SYNC: Failed to update order ${order.id}:`, updateError)
              failedOrders.push({
                order_id: order.id,
                error: updateError.message
              })
            } else {
              syncedOrders.push({
                order_id: order.id,
                contract_order_id: contractOrderId,
                transaction_hash: order.transaction_hash
              })
            }
          } else {
            console.warn(`⚠️ SYNC: No OrderCreated event found for order ${order.id}`)
            failedOrders.push({
              order_id: order.id,
              error: 'No OrderCreated event found in transaction logs'
            })
          }
        } else {
          console.warn(`⚠️ SYNC: No transaction receipt found for order ${order.id}`)
          failedOrders.push({
            order_id: order.id,
            error: 'No transaction receipt found'
          })
        }
      } catch (error) {
        console.error(`❌ SYNC: Error processing order ${order.id}:`, error)
        failedOrders.push({
          order_id: order.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`✅ SYNC: Completed sync - ${syncedOrders.length} succeeded, ${failedOrders.length} failed`)

    return NextResponse.json({
      success: true,
      orders_synced: syncedOrders.length,
      orders_failed: failedOrders.length,
      synced_orders: syncedOrders,
      failed_orders: failedOrders,
      property_id,
      message: `Synced ${syncedOrders.length} orders successfully`
    })

  } catch (error) {
    console.error('❌ SYNC: Error in contract order ID sync:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 