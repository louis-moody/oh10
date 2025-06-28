import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// fix: OpenHouseRouter ABI for market data (Cursor Rule 4)
const ROUTER_ABI = [
  {
    name: 'getPropertyMarketData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'propertyId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'propertyId', type: 'uint256' },
        { name: 'orderbook', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'bestBuyPrice', type: 'uint256' },
        { name: 'bestSellPrice', type: 'uint256' },
        { name: 'buyLiquidity', type: 'uint256' },
        { name: 'sellLiquidity', type: 'uint256' },
        { name: 'lastUpdated', type: 'uint256' },
        { name: 'isActive', type: 'bool' }
      ]
    }]
  }
] as const

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const chainId = searchParams.get('chainId') || '84532'

    if (!propertyId) {
      return NextResponse.json({ error: 'Property ID required' }, { status: 400 })
    }

    // fix: get router address (Cursor Rule 4)
    const { data: router, error: routerError } = await supabaseAdmin
      .from('openhouse_router')
      .select('contract_address')
      .eq('chain_id', parseInt(chainId))
      .eq('is_active', true)
      .single()

    if (routerError || !router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 })
    }

    // fix: create public client for blockchain calls (Cursor Rule 4)
    const chain = chainId === '8453' ? base : baseSepolia
    const publicClient = createPublicClient({
      chain,
      transport: http()
    })

    // fix: convert UUID to numeric using SAME method as contracts (Cursor Rule 6)
    // This matches the method used in deploy-token/route.ts and register-property-with-router.js
    const propertyIdNumeric = propertyId.replace(/-/g, '').split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0)
    }, 0)

    console.log('🔍 MARKET DATA: Converting property ID:', {
      propertyId,
      propertyIdNumeric,
      routerAddress: router.contract_address
    })

    // fix: fetch market data from router contract (Cursor Rule 4)
    const marketData = await publicClient.readContract({
      address: router.contract_address as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getPropertyMarketData',
      args: [BigInt(propertyIdNumeric)]
    })

    // fix: format market data for frontend (Cursor Rule 4)
    const propId = marketData.propertyId
    const orderbook = marketData.orderbook
    const token = marketData.token
    const bestBuyPrice = marketData.bestBuyPrice
    const bestSellPrice = marketData.bestSellPrice
    const buyLiquidity = marketData.buyLiquidity
    const sellLiquidity = marketData.sellLiquidity
    const lastUpdated = marketData.lastUpdated
    const isActive = marketData.isActive

    return NextResponse.json({
      propertyId: propId.toString(),
      orderbook,
      token,
      bestBuyPrice: bestBuyPrice.toString(),
      bestSellPrice: bestSellPrice.toString(),
      buyLiquidity: buyLiquidity.toString(),
      sellLiquidity: sellLiquidity.toString(),
      lastUpdated: Number(lastUpdated),
      isActive,
      fetchedAt: Date.now()
    })

  } catch (error) {
    console.error('❌ Market data fetch failed:', error)
    return NextResponse.json({
      error: 'Failed to fetch market data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 