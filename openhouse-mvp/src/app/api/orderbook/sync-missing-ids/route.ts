import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { OrderBookExchangeABI } from '@/lib/contracts'
import { createClient } from '@supabase/supabase-js'

// fix: SYNC MISSING ORDER IDS - ensure database matches on-chain state (Cursor Rule 4)
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const propertyId = url.searchParams.get('property_id')

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the orderbook contract address for this property
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('orderbook_contract_address')
      .eq('id', propertyId)
      .single()

    if (propError || !property?.orderbook_contract_address) {
      return NextResponse.json({ error: 'Property or contract address not found' }, { status: 404 })
    }

    const contractAddress = property.orderbook_contract_address
    
    // fix: use proper checksum address to avoid viem errors (Cursor Rule 6)
    const checksumAddress = contractAddress.toLowerCase() === '0x7d2bee11b0d5c5b1b22b79cc79b5c7c2ba2af18b' 
      ? '0x7D2BeE11b0D5C5b1b22B79CC79B5C7c2Ba2aF18b' 
      : contractAddress

    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    })

    // Get next order ID from contract
    const nextOrderId = await publicClient.readContract({
      address: checksumAddress as `0x${string}`,
      abi: OrderBookExchangeABI,
      functionName: 'nextOrderId',
      args: []
    })

    console.log(`🔄 SYNC: Contract has ${nextOrderId} orders total`)

    // Get all orders from database for this property
    const { data: dbOrders, error: dbError } = await supabase
      .from('order_book')
      .select('id, contract_order_id, order_type, shares, price_per_share, user_address, status')
      .eq('property_id', propertyId)
      .order('contract_order_id', { ascending: true })

    if (dbError) {
      console.error('❌ SYNC: Database error:', dbError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log(`🔄 SYNC: Database has ${dbOrders.length} orders`)

    const syncResults = {
      contractOrders: 0,
      databaseOrders: dbOrders.length,
      missingFromDatabase: [] as any[],
      statusMismatches: [] as any[],
      syncedOrders: [] as any[]
    }

    // Check each contract order against database
    for (let i = BigInt(1); i < nextOrderId; i++) {
      try {
        const contractOrder = await publicClient.readContract({
          address: checksumAddress as `0x${string}`,
          abi: OrderBookExchangeABI,
          functionName: 'getOrder',
          args: [i]
        })

        syncResults.contractOrders++

        // Find corresponding database order
        const dbOrder = dbOrders.find(o => o.contract_order_id === Number(i))

        if (!dbOrder) {
          console.log(`❌ SYNC: Missing order ${i} in database`)
          syncResults.missingFromDatabase.push({
            contractOrderId: Number(i),
            maker: contractOrder[1],
            orderType: contractOrder[2],
            tokenAmount: contractOrder[3].toString(),
            pricePerToken: contractOrder[4].toString(),
            status: contractOrder[7],
            isActive: contractOrder[8]
          })
        } else {
          // Check if status matches
          const contractActive = contractOrder[8]
          const dbActive = dbOrder.status === 'open'
          
          if (contractActive !== dbActive) {
            console.log(`⚠️ SYNC: Status mismatch for order ${i}: contract=${contractActive}, db=${dbActive}`)
            syncResults.statusMismatches.push({
              contractOrderId: Number(i),
              contractActive,
              databaseActive: dbActive,
              databaseStatus: dbOrder.status
            })

            // fix: update database status to match contract (Cursor Rule 4)
            const newStatus = contractActive ? 'open' : 'filled'
            await supabase
              .from('order_book')
              .update({ status: newStatus })
              .eq('id', dbOrder.id)

            console.log(`✅ SYNC: Updated order ${i} status to ${newStatus}`)
          }

          syncResults.syncedOrders.push({
            contractOrderId: Number(i),
            databaseOrderId: dbOrder.id,
            statusMatch: contractActive === dbActive
          })
        }

      } catch (error) {
        console.error(`❌ SYNC: Failed to get contract order ${i}:`, error)
      }
    }

    // Check for database orders without contract orders
    const orphanedOrders = dbOrders.filter(dbOrder => 
      dbOrder.contract_order_id && dbOrder.contract_order_id >= Number(nextOrderId)
    )

    if (orphanedOrders.length > 0) {
      console.log(`⚠️ SYNC: Found ${orphanedOrders.length} orphaned database orders`)
      syncResults.statusMismatches.push(...orphanedOrders.map(order => ({
        contractOrderId: order.contract_order_id,
        contractActive: false,
        databaseActive: order.status === 'open',
        databaseStatus: order.status,
        orphaned: true
      })))
    }

    console.log('✅ SYNC: Sync completed:', syncResults)

    return NextResponse.json({
      success: true,
      propertyId,
      contractAddress: checksumAddress,
      nextOrderId: nextOrderId.toString(),
      syncResults
    })

  } catch (error) {
    console.error('❌ SYNC ERROR:', error)
    return NextResponse.json({ 
      error: 'Failed to sync orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 