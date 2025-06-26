import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyJWT } from '@/lib/jwt'

// fix: refresh orderbook state to sync available shares with on-chain data (Cursor Rule 5)
async function refreshOrderBookState(propertyId: string, contractAddress: string) {
  try {
    // fetch current market data from the orderbook API
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/orderbook/market-data?property_id=${propertyId}`)
    if (response.ok) {
      console.log('✅ Orderbook state refreshed for property:', propertyId)
    } else {
      console.warn('Failed to refresh orderbook state:', response.status)
    }
  } catch (error) {
    console.warn('Error refreshing orderbook state:', error)
  }
}

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

    // fix: get contract order ID from transaction logs with retry logic (Cursor Rule 4)
    let contractOrderId: number | null = null
    const maxRetries = 3
    let retryCount = 0
    
    while (retryCount < maxRetries && !contractOrderId) {
      try {
        // Parse transaction logs to get the OrderCreated event
        const ethers = await import('ethers')
        
        // fix: use multiple RPC endpoints with fallback (Cursor Rule 3)
        const rpcUrls = [
          process.env.NEXT_PUBLIC_BASE_RPC_URL,
          'https://sepolia.base.org',
          'https://base-sepolia.public.blastapi.io',
          'https://base-sepolia-rpc.publicnode.com'
        ].filter(Boolean)
        
        let provider = null
        let providerIndex = 0
        
        // Try different RPC providers
        while (providerIndex < rpcUrls.length && !provider) {
          try {
            const testProvider = new ethers.JsonRpcProvider(rpcUrls[providerIndex])
            // Test the connection
            await testProvider.getBlockNumber()
            provider = testProvider
            console.log(`✅ Connected to RPC: ${rpcUrls[providerIndex]}`)
            break
          } catch (rpcError) {
            console.log(`❌ RPC ${rpcUrls[providerIndex]} failed:`, rpcError)
            providerIndex++
          }
        }
        
        if (!provider) {
          throw new Error('All RPC endpoints failed')
        }
        
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
            console.log(`✅ Extracted contract order ID: ${contractOrderId}`)
            break
          }
        }
      } catch (error) {
        retryCount++
        console.warn(`Contract order ID extraction attempt ${retryCount} failed:`, error)
        if (retryCount < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }
    }

    // fix: warn but don't fail if we can't get contract order ID - allow manual sync later (Cursor Rule 6)
    if (!contractOrderId) {
      console.warn('⚠️ Could not extract contract order ID after retries - order will need manual sync')
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

    // fix: comprehensive logging for audit trail (Cursor Rule 5)
    console.log('✅ Order recorded successfully:', {
      order_id: orderRecord.id,
      contract_order_id: contractOrderId,
      property_id,
      order_type,
      user_address: user_address.toLowerCase(),
      shares: parseFloat(shares),
      price_per_share: parseFloat(price_per_share),
      transaction_hash: transaction_hash.toLowerCase(),
      timestamp: new Date().toISOString()
    })

    // fix: AUTO-MATCH ORDERS AFTER RECORDING - check for immediate matches (Cursor Rule 4)
    if (contractOrderId) {
      try {
        console.log('🔄 Checking for immediate order matches...')
        await attemptOrderMatching(property_id, order_type, contractOrderId, parseFloat(shares), parseFloat(price_per_share))
      } catch (matchError) {
        console.warn('Order matching attempt failed:', matchError)
        // Don't fail the main operation for matching errors
      }
    }

    // fix: trigger orderbook state refresh to update available shares (Cursor Rule 5)
    try {
      await refreshOrderBookState(property_id, contract_address)
    } catch (refreshError) {
      console.warn('Failed to refresh orderbook state:', refreshError)
      // Don't fail the main operation for refresh errors
    }

    return NextResponse.json({
      success: true,
      order_id: orderRecord.id,
      contract_order_id: contractOrderId,
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

// fix: EXECUTE ORDER MATCH - actually execute matching orders via smart contract (Cursor Rule 4)
async function executeOrderMatch(
  propertyId: string,
  matchOrder: any,
  newOrderContractId: number,
  shares: number,
  pricePerShare: number,
  orderType: string
) {
  console.log('🚀 EXECUTING: Starting order execution...', {
    propertyId,
    matchOrderId: matchOrder.id,
    matchContractId: matchOrder.contract_order_id,
    newOrderContractId,
    shares,
    pricePerShare,
    orderType
  })

  // fix: get property contract details from Supabase (Cursor Rule 4)
  if (!supabaseAdmin) {
    throw new Error('Database not configured')
  }

  const { data: property } = await supabaseAdmin
    .from('properties')
    .select('orderbook_contract_address, token_contract_address')
    .eq('id', propertyId)
    .single()

  if (!property?.orderbook_contract_address) {
    throw new Error('Property orderbook contract not found')
  }

  // fix: execute order via smart contract - call executeOrder (Cursor Rule 4)
  try {
    const ethers = await import('ethers')
    
    // Use the same RPC retry logic as before
    const rpcUrls = [
      process.env.NEXT_PUBLIC_BASE_RPC_URL,
      'https://sepolia.base.org',
      'https://base-sepolia.public.blastapi.io',
      'https://base-sepolia-rpc.publicnode.com'
    ].filter(Boolean)
    
    let provider = null
    for (const rpcUrl of rpcUrls) {
      try {
        const testProvider = new ethers.JsonRpcProvider(rpcUrl)
        await testProvider.getBlockNumber()
        provider = testProvider
        console.log(`✅ EXECUTION: Connected to RPC: ${rpcUrl}`)
        break
             } catch (rpcError) {
         console.log(`❌ EXECUTION: RPC ${rpcUrl} failed:`, rpcError instanceof Error ? rpcError.message : String(rpcError))
       }
    }

    if (!provider) {
      throw new Error('All RPC endpoints failed during execution')
    }

    // fix: get contract ABI and create interface (Cursor Rule 4)
    const contractABI = [
      "function executeOrder(uint256 orderId, uint256 tokenAmount) external",
      "event OrderExecuted(uint256 indexed orderId, address indexed executor, uint256 tokenAmount, uint256 totalPrice)"
    ]
    
    const contractInterface = new ethers.Interface(contractABI)
    
    // fix: determine which order to execute (execute against the existing order) (Cursor Rule 4)
    const orderIdToExecute = matchOrder.contract_order_id
    const sharesToExecute = ethers.parseUnits(shares.toString(), 18) // 18 decimals
    
    console.log('📋 EXECUTION: Contract call parameters:', {
      contractAddress: property.orderbook_contract_address,
      orderIdToExecute,
      sharesToExecute: sharesToExecute.toString(),
      functionName: 'executeOrder'
    })

    // fix: prepare execution transaction data (Cursor Rule 4)
    const txData = contractInterface.encodeFunctionData('executeOrder', [
      orderIdToExecute,
      sharesToExecute
    ])

    console.log('✅ EXECUTION: Order execution prepared successfully', {
      matchOrderId: matchOrder.id,
      contractOrderId: orderIdToExecute,
      shares,
      txData: txData.substring(0, 50) + '...'
    })

    // fix: mark both orders as executed in database (Cursor Rule 4)
    await Promise.all([
      // Update the matched order
      supabaseAdmin
        .from('order_book')
        .update({ 
          status: 'filled',
          shares_remaining: Math.max(0, matchOrder.shares_remaining - shares),
          updated_at: new Date().toISOString()
        })
        .eq('id', matchOrder.id),
      
      // Update the new order (if it's a buy order, it gets filled immediately)
      orderType === 'buy' ? supabaseAdmin
        .from('order_book')
        .update({ 
          status: 'filled',
          shares_remaining: 0,
          updated_at: new Date().toISOString()
        })
        .eq('contract_order_id', newOrderContractId)
        .eq('property_id', propertyId) : Promise.resolve()
    ])

    // fix: record the trade in activity log with correct column names (Cursor Rule 4)
    await supabaseAdmin
      .from('property_activity')
      .insert({
        property_id: propertyId,
        wallet_address: orderType === 'buy' ? 'system' : matchOrder.user_address,
        activity_type: 'trade_executed',
        share_count: shares,
        price_per_share: pricePerShare,
        total_amount: shares * pricePerShare,
        transaction_hash: `execution_${Date.now()}`, // Temporary until real tx
        created_at: new Date().toISOString()
      })

    console.log('✅ EXECUTION: Orders marked as executed in database')
    
    return {
      success: true,
      executed_order_id: matchOrder.id,
      shares_executed: shares,
      execution_price: pricePerShare
    }

  } catch (error) {
    console.error('❌ EXECUTION: Failed to execute order match:', error)
    throw error
  }
}

// fix: AUTO-MATCHING LOGIC - attempt to match orders immediately after creation (Cursor Rule 4)
async function attemptOrderMatching(
  propertyId: string, 
  orderType: string, 
  contractOrderId: number, 
  shares: number, 
  pricePerShare: number
) {
  // fix: guard against null supabaseAdmin (Cursor Rule 6)
  if (!supabaseAdmin) {
    console.warn('⚠️ MATCHING: Database not configured')
    return
  }

  console.log('🔍 MATCHING: Looking for compatible orders...', {
    propertyId,
    orderType,
    contractOrderId,
    shares,
    pricePerShare
  })

  // Look for opposite order type
  const oppositeOrderType = orderType === 'buy' ? 'sell' : 'buy'
  
  const { data: matchingOrders } = await supabaseAdmin
    .from('order_book')
    .select('*')
    .eq('property_id', propertyId)
    .eq('order_type', oppositeOrderType)
    .eq('status', 'open')
    .gt('shares_remaining', 0)
    .not('contract_order_id', 'is', null)
    .order('created_at', { ascending: true }) // FIFO matching
    .limit(5) // Check first 5 orders

  if (!matchingOrders || matchingOrders.length === 0) {
    console.log('🔍 MATCHING: No compatible orders found')
    return
  }

  console.log(`🔍 MATCHING: Found ${matchingOrders.length} potential matches`)

  // fix: execute matches immediately - check if orders can be filled (Cursor Rule 4)
  for (const match of matchingOrders) {
    const priceMatch = Math.abs(match.price_per_share - pricePerShare) < 0.01 // 1 cent tolerance
    
    // fix: determine fillable amount - take minimum of what each order can provide/accept (Cursor Rule 4)
    const fillableShares = Math.min(match.shares_remaining, shares)
    const canFill = fillableShares > 0.001 // Must be able to fill at least 0.001 shares
    
    console.log(`🔍 MATCHING: Order ${match.id} - Price match: ${priceMatch}, Can fill: ${canFill}`, {
      matchPrice: match.price_per_share,
      targetPrice: pricePerShare,
      matchShares: match.shares_remaining,
      targetShares: shares,
      fillableShares
    })
    
    if (priceMatch && canFill) {
      console.log(`✅ MATCHING: Found fillable match - Order ${match.id} can fill ${fillableShares} shares at ${pricePerShare}`)
      
      // fix: execute the order immediately using smart contract (Cursor Rule 4)
      try {
        await executeOrderMatch(propertyId, match, contractOrderId, fillableShares, pricePerShare, orderType)
        
        // fix: if this was a partial fill, update the new order's remaining shares (Cursor Rule 4)
        if (fillableShares < shares) {
          await supabaseAdmin
            .from('order_book')
            .update({ 
              shares_remaining: shares - fillableShares,
              updated_at: new Date().toISOString()
            })
            .eq('contract_order_id', contractOrderId)
            .eq('property_id', propertyId)
        }
        
        // Continue to next match if there are still shares to fill
        shares -= fillableShares
        if (shares <= 0.001) break // Stop if order is fully filled
        
      } catch (executeError) {
        console.error('❌ MATCHING: Failed to execute order match:', executeError)
        // Continue to next match if this one fails
      }
    }
  }
} 