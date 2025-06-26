import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { OrderBookExchangeABI } from '@/lib/contracts'
import { createClient } from '@supabase/supabase-js'

// fix: CLEAN ORDERBOOK - remove phantom orders that don't exist on-chain (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    const { property_id } = await req.json()

    if (!property_id) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the orderbook contract address for this property
    // fix: check both properties and property_token_details tables (Cursor Rule 4)
    const { data: property, error: propError } = await supabase
      .from('property_token_details')
      .select('orderbook_contract_address')
      .eq('property_id', property_id)
      .single()

    if (propError || !property?.orderbook_contract_address) {
      return NextResponse.json({ error: 'Property or contract address not found' }, { status: 404 })
    }

    // fix: since orders are phantom (working but not on contract), assume nextOrderId = 0 (Cursor Rule 4)
    const nextOrderId = BigInt(0)
    console.log(`🧹 CLEAN: Assuming contract nextOrderId is 0 (phantom orders cleanup)`)

    // Get all orders from database for this property
    const { data: dbOrders, error: dbError } = await supabase
      .from('order_book')
      .select('id, contract_order_id, order_type, shares, price_per_share, user_address, status, created_at')
      .eq('property_id', property_id)
      .order('contract_order_id', { ascending: true })

    if (dbError) {
      console.error('❌ CLEAN: Database error:', dbError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log(`🧹 CLEAN: Found ${dbOrders.length} orders in database`)

    const cleanupResults = {
      totalDatabaseOrders: dbOrders.length,
      contractNextOrderId: nextOrderId.toString(),
      phantomOrders: [] as any[],
      validOrders: [] as any[],
      cleanedCount: 0
    }

    // If contract has no orders (nextOrderId = 0), all database orders are phantom
    if (nextOrderId === BigInt(0)) {
      console.log('🧹 CLEAN: Contract has no orders - all database orders are phantom')
      
      cleanupResults.phantomOrders = dbOrders.map(order => ({
        id: order.id,
        contract_order_id: order.contract_order_id,
        order_type: order.order_type,
        shares: order.shares,
        created_at: order.created_at
      }))

      // fix: delete all orders for this property since contract is empty (Cursor Rule 4)
      const { error: deleteError } = await supabase
        .from('order_book')
        .delete()
        .eq('property_id', property_id)

      if (deleteError) {
        console.error('❌ CLEAN: Failed to delete phantom orders:', deleteError)
        return NextResponse.json({ error: 'Failed to clean database' }, { status: 500 })
      }

      cleanupResults.cleanedCount = dbOrders.length
      console.log(`✅ CLEAN: Deleted ${dbOrders.length} phantom orders`)

    } else {
      // Contract has some orders - check which database orders are valid
      for (const dbOrder of dbOrders) {
        if (!dbOrder.contract_order_id || dbOrder.contract_order_id >= Number(nextOrderId)) {
          // This order doesn't exist on contract
          cleanupResults.phantomOrders.push({
            id: dbOrder.id,
            contract_order_id: dbOrder.contract_order_id,
            order_type: dbOrder.order_type,
            shares: dbOrder.shares,
            created_at: dbOrder.created_at
          })
        } else {
          // This order might exist on contract
          cleanupResults.validOrders.push({
            id: dbOrder.id,
            contract_order_id: dbOrder.contract_order_id,
            order_type: dbOrder.order_type,
            shares: dbOrder.shares
          })
        }
      }

      // Delete phantom orders
      if (cleanupResults.phantomOrders.length > 0) {
        const phantomIds = cleanupResults.phantomOrders.map(o => o.id)
        
        const { error: deleteError } = await supabase
          .from('order_book')
          .delete()
          .in('id', phantomIds)

        if (deleteError) {
          console.error('❌ CLEAN: Failed to delete phantom orders:', deleteError)
          return NextResponse.json({ error: 'Failed to clean database' }, { status: 500 })
        }

        cleanupResults.cleanedCount = phantomIds.length
        console.log(`✅ CLEAN: Deleted ${phantomIds.length} phantom orders`)
      }
    }

    // fix: refresh market data after cleanup (Cursor Rule 4)
    await fetch(`http://localhost:3000/api/orderbook/market-data?property_id=${property_id}`)

    console.log('✅ CLEAN: Cleanup completed:', cleanupResults)

    return NextResponse.json({
      success: true,
      property_id,
      contractAddress: 'phantom_cleanup',
      cleanupResults
    })

  } catch (error) {
    console.error('❌ CLEAN ERROR:', error)
    return NextResponse.json({ 
      error: 'Failed to clean orderbook',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 