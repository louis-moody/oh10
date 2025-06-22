import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { OrderBookExchangeABI } from '@/lib/contracts'

// fix: DEBUG CONTRACT ORDERS - check what orders actually exist on-chain (Cursor Rule 6)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const contractAddress = url.searchParams.get('contract_address')

    if (!contractAddress) {
      return NextResponse.json({ error: 'Contract address required' }, { status: 400 })
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    })

    // fix: first check if any orders have been created at all (Cursor Rule 6)
    let nextOrderId: bigint = BigInt(0)
    try {
      nextOrderId = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'nextOrderId',
        args: []
      })
      console.log('🔍 CONTRACT DEBUG: Next Order ID:', nextOrderId.toString())
    } catch (error) {
      console.log('❌ CONTRACT DEBUG: Failed to get nextOrderId:', error)
    }

    // Try to get sell orders using getOrdersByType
    let sellOrderIds: readonly bigint[] = []
    let buyOrderIds: readonly bigint[] = []
    
    try {
      sellOrderIds = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'getOrdersByType',
        args: [1] // 1 = SELL
      })
      console.log('🔍 CONTRACT DEBUG: Sell order IDs:', sellOrderIds)
    } catch (error) {
      console.log('❌ CONTRACT DEBUG: Failed to get sell orders:', error)
    }

    try {
      buyOrderIds = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'getOrdersByType',
        args: [0] // 0 = BUY
      })
      console.log('🔍 CONTRACT DEBUG: Buy order IDs:', buyOrderIds)
    } catch (error) {
      console.log('❌ CONTRACT DEBUG: Failed to get buy orders:', error)
    }

    // fix: if nextOrderId > 1, manually check orders 1, 2, 3... (Cursor Rule 6)
    const orders = []
    const manualOrderIds = []
    
    if (nextOrderId > BigInt(1)) {
      console.log(`🔍 CONTRACT DEBUG: Checking orders 1 to ${nextOrderId - BigInt(1)} manually...`)
      for (let i = BigInt(1); i < nextOrderId; i++) {
        manualOrderIds.push(i)
      }
    }
    
    const allOrderIds = [...sellOrderIds, ...buyOrderIds, ...manualOrderIds]
    
    for (const orderId of allOrderIds) {
      try {
        const order = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: OrderBookExchangeABI,
          functionName: 'getOrder',
          args: [orderId]
        })

        console.log(`🔍 CONTRACT DEBUG: Order ${orderId}:`, order)
        
        orders.push({
          orderId: orderId.toString(),
          id: order[0].toString(),
          maker: order[1],
          orderType: order[2], // 0 = BUY, 1 = SELL
          tokenAmount: order[3].toString(),
          pricePerToken: order[4].toString(),
          totalValue: order[5].toString(),
          filledAmount: order[6].toString(),
          status: order[7], // 0 = OPEN, 1 = FILLED, 2 = CANCELLED
          isActive: order[8]
        })
      } catch (error) {
        console.log(`❌ CONTRACT DEBUG: Failed to get order ${orderId}:`, error)
      }
    }

    const sellOrders = orders.filter(o => o.orderType === 1 && o.isActive)
    const buyOrders = orders.filter(o => o.orderType === 0 && o.isActive)

    return NextResponse.json({
      contractAddress,
      nextOrderId: nextOrderId.toString(),
      sellOrderIds: sellOrderIds.map(id => id.toString()),
      buyOrderIds: buyOrderIds.map(id => id.toString()),
      manualOrderIds: manualOrderIds.map(id => id.toString()),
      totalOrders: orders.length,
      activeOrders: orders.filter(o => o.isActive).length,
      sellOrders: {
        count: sellOrders.length,
        orders: sellOrders
      },
      buyOrders: {
        count: buyOrders.length,
        orders: buyOrders
      },
      allOrders: orders
    })

  } catch (error) {
    console.error('❌ CONTRACT DEBUG ERROR:', error)
    return NextResponse.json({ 
      error: 'Failed to check contract orders',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 