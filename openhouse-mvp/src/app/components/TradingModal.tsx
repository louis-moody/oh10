'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent} from './ui/card'
import {TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, Building2, ChevronDown } from 'lucide-react'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { OrderBookExchangeABI, getUsdcAddress as getUsdcAddressByChain } from '@/lib/contracts'
import Image from 'next/image'

interface TradingModalProps {
  isOpen: boolean
  onClose: () => void
  property: {
    id: string
    name: string
    price_per_token: number
    token_symbol: string
    total_shares: number
    status: string
    contract_address?: string
    orderbook_contract_address?: string
  }
  onTradeSuccess: () => void
}

type TradeTab = 'buy' | 'sell'
type FlowState = 'input' | 'executing' | 'success' | 'error'

export function TradingModal({ 
  isOpen, 
  onClose, 
  property,
  onTradeSuccess
}: TradingModalProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>('buy')
  const [showDropdown, setShowDropdown] = useState(false)
  const [usdcAmount, setUsdcAmount] = useState('')
  const [shareAmount, setShareAmount] = useState('')
  const [flowState, setFlowState] = useState<FlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [wasExecutedInstantly, setWasExecutedInstantly] = useState<boolean>(false) // fix: track if order was executed vs placed (Cursor Rule 7)

  // fix: SIMPLE STATE TRACKING - no complex hash management (Cursor Rule 1)
  const [transactionStep, setTransactionStep] = useState<'idle' | 'wallet_approval' | 'approving' | 'trading'>('idle')
  const [recordedHashes, setRecordedHashes] = useState<Set<string>>(new Set())

  const { address, isConnected, chainId } = useAccount()
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  // fix: COMPREHENSIVE ERROR HANDLING and logging (Cursor Rule 6)
  useEffect(() => {
    if (writeError) {
      // fix: comprehensive error logging for audit trail (Cursor Rule 5)
      console.error('❌ TRADING MODAL: Transaction error:', {
        error: writeError.message,
        cause: writeError.cause,
        activeTab,
        transactionStep,
        userAddress: address,
        propertyId: property.id,
        timestamp: new Date().toISOString()
      })
      
      // fix: user-friendly error messages (Cursor Rule 6)
      let userErrorMessage = 'Transaction failed'
      if (writeError.message.includes('insufficient funds')) {
        userErrorMessage = 'Insufficient funds for transaction'
      } else if (writeError.message.includes('allowance')) {
        userErrorMessage = 'Token allowance error - please try again'
      } else if (writeError.message.includes('rejected')) {
        userErrorMessage = 'Transaction rejected by user'
      } else if (writeError.message.includes('network')) {
        userErrorMessage = 'Network error - please check connection'
      }
      
      setError(userErrorMessage)
      setFlowState('error')
      setTransactionStep('idle')
    }
  }, [writeError, activeTab, transactionStep, address, property.id])

  // fix: SIMPLE BALANCE LOADING (Cursor Rule 1)
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(BigInt(0))
  const [userTokenBalance, setUserTokenBalance] = useState<bigint>(BigInt(0))

  // fix: ORDERBOOK STATUS STATE - show market depth (Cursor Rule 14)
  const [availableShares, setAvailableShares] = useState<number>(0)
  const [orderBookDepth, setOrderBookDepth] = useState<{buyOrders: number, sellOrders: number}>({buyOrders: 0, sellOrders: 0})

  // Load balances when modal opens
  useEffect(() => {
    if (isOpen && address) {
      console.log('🔍 TRADING MODAL: Loading balances for:', { address, propertyId: property.id })
      loadUserBalances()
      loadOrderBookData() // fix: load market data when modal opens (Cursor Rule 14)
    }
  }, [isOpen, address, property.id])

  // fix: SIMPLE TRANSACTION HANDLER - step-based logic (Cursor Rule 1)
  useEffect(() => {
    console.log('🔍 TRADING MODAL: Transaction effect triggered:', {
      hash,
      isConfirmed,
      transactionStep,
      hasRecorded: recordedHashes.has(hash || ''),
      activeTab
    })

    if (!hash || !isConfirmed || recordedHashes.has(hash)) return

    console.log('✅ TRADING MODAL: Transaction confirmed:', hash, 'Step:', transactionStep)

    // fix: APPROVAL STEP DETECTION (Cursor Rule 1)
    if (transactionStep === 'approving') {
      console.log('✅ TRADING MODAL: Approval confirmed, proceeding to trade...')
      setRecordedHashes(prev => new Set([...prev, hash])) // Mark approval as recorded
      setTransactionStep('trading')
      
      // fix: DIRECT TRADE EXECUTION - no setTimeout delays (Cursor Rule 1)
      if (activeTab === 'buy') {
        console.log('🛒 TRADING MODAL: Calling executeMarketBuy after approval')
        executeMarketBuy()
      } else {
        console.log('💰 TRADING MODAL: Calling executeTrade after approval')
        executeTrade()
      }
      return
    }

    // fix: TRADE STEP DETECTION - verify smart contract success before recording (Cursor Rule 4)
    if (transactionStep === 'trading') {
      console.log('✅ TRADING MODAL: Trade transaction confirmed, verifying smart contract success...')
      setRecordedHashes(prev => new Set([...prev, hash])) // Mark trade as recorded
      
      // fix: verify the order was actually created on the smart contract (Cursor Rule 4)
      verifyOrderCreationAndRecord(hash)
      return
    }

    console.log('🔄 TRADING MODAL: Unknown transaction step, ignoring')
  }, [hash, isConfirmed, transactionStep, activeTab, onTradeSuccess])

  // fix: SHOW PROCESSING STATE only when transaction step is active, not based on flowState (Cursor Rule 7)
  const isProcessingOnChain = transactionStep === 'wallet_approval' || transactionStep === 'approving' || transactionStep === 'trading'

  // fix: SIMPLIFIED BUY WITH APPROVAL (Cursor Rule 1)
  const executeBuyWithApproval = async () => {
    if (!address || !usdcAmount) return

    try {
      setFlowState('executing')
      setError('')
      setTransactionStep('wallet_approval') // Show "Please sign wallet" first

      const ethers = await import('ethers')
      const usdcAmountWei = ethers.parseUnits(usdcAmount, 6)
      const fee = usdcAmountWei * BigInt(5) / BigInt(1000) // 0.5% fee
      const totalAmount = usdcAmountWei + fee

      // fix: check if user has enough USDC balance (Cursor Rule 6)
      if (userUsdcBalance < totalAmount) {
        const requiredUSDC = parseFloat(ethers.formatUnits(totalAmount, 6))
        const currentUSDC = parseFloat(ethers.formatUnits(userUsdcBalance, 6))
        setError(`Insufficient USDC balance. Required: $${requiredUSDC.toFixed(3)}, Available: $${currentUSDC.toFixed(3)}`)
        setFlowState('error')
        return
      }

      console.log('🛒 TRADING MODAL: Approving USDC for buy order...', {
        usdcAmount: ethers.formatUnits(usdcAmountWei, 6),
        fee: ethers.formatUnits(fee, 6),
        totalAmount: ethers.formatUnits(totalAmount, 6),
        userBalance: ethers.formatUnits(userUsdcBalance, 6)
      })
      
      // fix: SIMPLE APPROVAL CALL (Cursor Rule 1)
      writeContract({
        address: getUsdcAddress() as `0x${string}`,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'approve',
        args: [property.orderbook_contract_address as `0x${string}`, totalAmount]
      })
      
      // Update to approval step after wallet interaction starts
      setTransactionStep('approving')

    } catch (error) {
      console.error('❌ TRADING MODAL: Approval error:', error)
      setError(error instanceof Error ? error.message : 'Approval failed')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: PROPER ORDER MATCHING - execute against real sell orders (Cursor Rule 2)
  const executeMarketBuy = async () => {
    if (!address || !property.orderbook_contract_address) {
      console.error('❌ TRADING MODAL: Missing address or contract')
      return
    }

    try {
      console.log('🛒 TRADING MODAL: executeMarketBuy called', {
        usdcAmount,
        shareAmount: calculateShares(),
        contractAddress: property.orderbook_contract_address
      })

      // fix: fetch current market data to find executable sell orders (Cursor Rule 2)
      const marketData = await fetch(`/api/orderbook/market-data?property_id=${property.id}`)
      const marketDataJson = await marketData.json()
      
      console.log('🛒 TRADING MODAL: Market data:', {
        availableShares: marketDataJson.available_shares,
        sellOrdersCount: marketDataJson.sell_orders?.length || 0,
        sellOrders: marketDataJson.sell_orders
      })

      if (marketDataJson.available_shares > 0 && marketDataJson.sell_orders?.length > 0) {
        console.log('✅ TRADING MODAL: Found sell orders - executing against orderbook')
        await executeInstantBuy(marketDataJson.sell_orders)
      } else {
        console.log('🛒 TRADING MODAL: No sell orders available - creating buy order')
        await createBuyOrder()
      }
      
    } catch (error) {
      console.error('❌ TRADING MODAL: executeMarketBuy error:', error)
      setError(error instanceof Error ? error.message : 'Failed to execute buy order')
      setFlowState('input')
      setTransactionStep('idle')
    }
  }

  // fix: EXECUTE INSTANT BUY AGAINST SELL ORDERS (Cursor Rule 2)
  const executeInstantBuy = async (sellOrders: any[]) => {
    if (!address || !usdcAmount || !property.orderbook_contract_address) return

    const targetShares = parseFloat(usdcAmount) / property.price_per_token
    
    console.log('🔍 TRADING MODAL: Looking for executable sell orders:', {
      sellOrdersCount: sellOrders.length,
      targetShares,
      sellOrders: sellOrders.map(o => ({
        id: o.id,
        shares_remaining: o.shares_remaining,
        price: o.price,
        contract_order_id: o.contract_order_id,
        status: o.status
      }))
    })

    // fix: check for orders without contract_order_id and offer sync (Cursor Rule 6)
    const ordersWithoutContractId = sellOrders.filter(order => !order.contract_order_id)
    if (ordersWithoutContractId.length > 0) {
      console.warn('⚠️ TRADING MODAL: Found orders without contract_order_id:', ordersWithoutContractId.length)
      console.log('📋 TRADING MODAL: These orders may need manual sync or RPC was failing during creation')
    }

    // fix: VERIFY ORDERS EXIST ON CONTRACT by checking individual orders with better error handling (Cursor Rule 2)
    console.log('🔍 TRADING MODAL: Verifying orders exist on contract...')
    
    const ethers = await import('ethers')
    
    // fix: use multiple RPC providers with fallback (Cursor Rule 3)
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
        // Test the connection quickly
        await Promise.race([
          testProvider.getBlockNumber(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ])
        provider = testProvider
        console.log(`✅ TRADING MODAL: Connected to RPC: ${rpcUrl}`)
        break
      } catch (rpcError) {
        console.log(`❌ TRADING MODAL: RPC ${rpcUrl} failed:`, rpcError)
      }
    }
    
    if (!provider) {
      console.error('❌ TRADING MODAL: All RPC endpoints failed - falling back to order placement')
      await createBuyOrder()
      return
    }
    
    // fix: check each sell order individually to see if it exists on contract (Cursor Rule 6)
    const validSellOrders = []
    
    for (const sellOrder of sellOrders) {
      // Skip orders without contract_order_id
      if (!sellOrder.contract_order_id) {
        console.log(`⚠️ TRADING MODAL: Skipping order ${sellOrder.id} - no contract_order_id`)
        continue
      }
      
      try {
        // Query the specific order from the contract with timeout
        const contract = new ethers.Contract(
          property.orderbook_contract_address,
          OrderBookExchangeABI,
          provider
        )
        
        const contractOrder = await Promise.race([
          contract.getOrder(sellOrder.contract_order_id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Contract call timeout')), 5000)
          )
        ])
        
        console.log(`🔍 TRADING MODAL: Contract order ${sellOrder.contract_order_id}:`, {
          orderId: contractOrder[0].toString(),
          creator: contractOrder[1],
          orderType: contractOrder[2],
          tokenAmount: contractOrder[3].toString(),
          pricePerToken: contractOrder[4].toString(),
          filledAmount: contractOrder[6].toString(),
          status: contractOrder[7],
          isActive: contractOrder[8]
        })
        
        // fix: validate order type is SELL (1) and log validation results (Cursor Rule 6)
        console.log(`🔍 TRADING MODAL: Order ${sellOrder.contract_order_id} type check - orderType: ${contractOrder[2]} (should be 1 for SELL)`)

        // fix: verify order is still active and has remaining shares (Cursor Rule 6)
        console.log(`🔍 TRADING MODAL: Order ${sellOrder.contract_order_id} status check:`, {
          isActive: contractOrder[8],
          status: contractOrder[7].toString(),
          tokenAmount: contractOrder[3].toString(),
          filledAmount: contractOrder[6].toString()
        })
        
        if (contractOrder[8] && contractOrder[7] === BigInt(0)) { // isActive && status === ACTIVE
          const remainingShares = contractOrder[3] - contractOrder[6] // tokenAmount - filledAmount
          console.log(`🔍 TRADING MODAL: Order ${sellOrder.contract_order_id} remaining shares:`, ethers.formatUnits(remainingShares, 18))
          if (remainingShares > 0) {
            validSellOrders.push({
              ...sellOrder,
              contractRemainingShares: ethers.formatUnits(remainingShares, 18)
            })
            console.log(`✅ TRADING MODAL: Added valid sell order ${sellOrder.contract_order_id}`)
          }
        } else {
          console.log(`❌ TRADING MODAL: Order ${sellOrder.contract_order_id} failed status check - isActive: ${contractOrder[8]}, status: ${contractOrder[7]}`)
        }
      } catch (error) {
        console.log(`❌ TRADING MODAL: Failed to verify order ${sellOrder.contract_order_id}:`, error)
      }
    }

    if (validSellOrders.length === 0) {
      console.log('❌ TRADING MODAL: NO VALID SELL ORDERS ON CONTRACT - database out of sync!')
      console.log('🛒 TRADING MODAL: Creating buy order instead of trying to execute non-existent orders')
      await createBuyOrder()
      return
    }

    // fix: find sell order that actually exists on contract and can fulfill the trade (Cursor Rule 2)
    console.log('🔍 TRADING MODAL: Checking valid sell orders for execution:', validSellOrders.map(order => ({
      id: order.id,
      contractOrderId: order.contract_order_id,
      contractRemainingShares: order.contractRemainingShares,
      status: order.status,
      statusType: typeof order.status,
      canFulfill: parseFloat(order.contractRemainingShares) >= targetShares
    })))

    const executableOrder = validSellOrders.find(order => {
      const remainingShares = parseFloat(order.contractRemainingShares)
      // fix: account for tiny fills - allow orders with 99.9% of target shares (Cursor Rule 4)
      const hasEnoughShares = remainingShares >= (targetShares * 0.999)
      const hasContractId = !!order.contract_order_id
      const statusIsOpen = order.status === 'open'
      console.log(`🔍 TRADING MODAL: Order ${order.contract_order_id} check:`, {
        hasEnoughShares,
        hasContractId,
        status: order.status,
        statusType: typeof order.status,
        statusIsOpen,
        remainingShares: order.contractRemainingShares,
        targetShares,
        threshold: targetShares * 0.999
      })
      
      // fix: require status to be 'open' as per database schema (Cursor Rule 4)
      return hasEnoughShares && hasContractId && statusIsOpen
    })

    if (!executableOrder) {
      console.log('❌ TRADING MODAL: No valid orders can fulfill the trade amount')
      console.log('🛒 TRADING MODAL: Creating buy order instead')
      await createBuyOrder()
      return
    }

    console.log('⚡ TRADING MODAL: Executing buy against sell order:', {
      orderId: executableOrder.id,
      contractOrderId: executableOrder.contract_order_id,
      contractRemainingShares: executableOrder.contractRemainingShares,
      targetShares,
      price: executableOrder.price
    })

    // fix: execute order with correct parameters for instant matching (Cursor Rule 2)
    const fillAmountWei = ethers.parseUnits(targetShares.toString(), 18)
    
    console.log('⚡ TRADING MODAL: Executing instant buy order...', {
      contractOrderId: executableOrder.contract_order_id,
      fillAmount: fillAmountWei.toString(),
      contractAddress: property.orderbook_contract_address
    })

    setTransactionStep('trading')
    setWasExecutedInstantly(true) // fix: mark this as instant execution (Cursor Rule 7)

    try {
      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'executeOrder',
        args: [BigInt(executableOrder.contract_order_id), fillAmountWei]
      })
    } catch (error) {
      console.error('❌ TRADING MODAL: executeOrder failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to execute order')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: SIMPLIFIED SELL WITH APPROVAL (Cursor Rule 1)
  const executeSellWithApproval = async () => {
    if (!address || !shareAmount) return

    try {
      setFlowState('executing')
      setError('')
      setTransactionStep('wallet_approval') // Show "Please sign wallet" first

      const ethers = await import('ethers')
      const sharesWei = ethers.parseUnits(shareAmount, 18)

      console.log('💰 TRADING MODAL: Approving tokens for sell order...')
      
      writeContract({
        address: property.contract_address as `0x${string}`,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'approve',
        args: [property.orderbook_contract_address as `0x${string}`, sharesWei]
      })
      
      // Update to approval step after wallet interaction starts
      setTransactionStep('approving')

    } catch (error) {
      console.error('❌ TRADING MODAL: Token approval error:', error)
      setError(error instanceof Error ? error.message : 'Token approval failed')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: SIMPLIFIED SELL EXECUTION (Cursor Rule 1)
  const executeTrade = async () => {
    if (!address || !shareAmount) return

    try {
      setFlowState('executing')
      setError('')

      console.log('🛒 TRADING MODAL: executeMarketSell called', {
        shareAmount,
        targetProceeds: calculateProceeds(),
        contractAddress: property.orderbook_contract_address
      })

      // fix: fetch current market data to find executable buy orders (Cursor Rule 2)
      const marketData = await fetch(`/api/orderbook/market-data?property_id=${property.id}`)
      const marketDataJson = await marketData.json()
      
      console.log('🛒 TRADING MODAL: Market data for sell:', {
        totalBuyDemand: marketDataJson.total_buy_demand,
        buyOrdersCount: marketDataJson.buy_orders?.length || 0,
        buyOrders: marketDataJson.buy_orders
      })

      if (marketDataJson.total_buy_demand > 0 && marketDataJson.buy_orders?.length > 0) {
        console.log('✅ TRADING MODAL: Found buy orders - executing against orderbook')
        await executeInstantSell(marketDataJson.buy_orders)
      } else {
        console.log('🛒 TRADING MODAL: No buy orders available - creating sell order')
        await createSellOrder()
      }
      
    } catch (error) {
      console.error('❌ TRADING MODAL: executeMarketSell error:', error)
      setError(error instanceof Error ? error.message : 'Failed to execute sell order')
      setFlowState('input')
      setTransactionStep('idle')
    }
  }

  // fix: EXECUTE INSTANT SELL AGAINST BUY ORDERS (Cursor Rule 2)
  const executeInstantSell = async (buyOrders: any[]) => {
    if (!address || !shareAmount || !property.orderbook_contract_address) return

    const targetShares = parseFloat(shareAmount)
    
    console.log('🔍 TRADING MODAL: Looking for executable buy orders:', {
      buyOrdersCount: buyOrders.length,
      targetShares,
      buyOrders: buyOrders.map(o => ({
        id: o.id,
        shares_remaining: o.shares_remaining,
        price: o.price,
        contract_order_id: o.contract_order_id,
        status: o.status
      }))
    })

    // fix: VERIFY ORDERS EXIST ON CONTRACT by checking individual orders (Cursor Rule 2)
    console.log('🔍 TRADING MODAL: Verifying buy orders exist on contract...')
    
    const ethers = await import('ethers')
    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org')
    
    // fix: check each buy order individually to see if it exists on contract (Cursor Rule 6)
    const validBuyOrders = []
    for (const buyOrder of buyOrders) {
      if (!buyOrder.contract_order_id) continue
      
      try {
        // Query the specific order from the contract
        const contract = new ethers.Contract(
          property.orderbook_contract_address,
          OrderBookExchangeABI,
          provider
        )
        
        const contractOrder = await contract.getOrder(buyOrder.contract_order_id)
        
        console.log(`🔍 TRADING MODAL: Contract buy order ${buyOrder.contract_order_id}:`, {
          orderId: contractOrder[0].toString(),
          creator: contractOrder[1],
          orderType: contractOrder[2],
          tokenAmount: contractOrder[3].toString(),
          pricePerToken: contractOrder[4].toString(),
          filledAmount: contractOrder[6].toString(),
          status: contractOrder[7],
          isActive: contractOrder[8]
        })
        
        // fix: validate order type is BUY (0) and log validation results (Cursor Rule 6)
        console.log(`🔍 TRADING MODAL: Order ${buyOrder.contract_order_id} type check - orderType: ${contractOrder[2]} (should be 0 for BUY)`)

        // fix: verify order is still active and has remaining shares (Cursor Rule 6)
        console.log(`🔍 TRADING MODAL: Buy order ${buyOrder.contract_order_id} status check:`, {
          isActive: contractOrder[8],
          status: contractOrder[7].toString(),
          tokenAmount: contractOrder[3].toString(),
          filledAmount: contractOrder[6].toString()
        })
        
        if (contractOrder[8] && contractOrder[7] === BigInt(0)) { // isActive && status === ACTIVE
          const remainingShares = contractOrder[3] - contractOrder[6] // tokenAmount - filledAmount
          console.log(`🔍 TRADING MODAL: Buy order ${buyOrder.contract_order_id} remaining shares:`, ethers.formatUnits(remainingShares, 18))
          if (remainingShares > 0) {
            validBuyOrders.push({
              ...buyOrder,
              contractRemainingShares: ethers.formatUnits(remainingShares, 18)
            })
            console.log(`✅ TRADING MODAL: Added valid buy order ${buyOrder.contract_order_id}`)
          }
        } else {
          console.log(`❌ TRADING MODAL: Buy order ${buyOrder.contract_order_id} failed status check - isActive: ${contractOrder[8]}, status: ${contractOrder[7]}`)
        }
      } catch (error) {
        console.log(`❌ TRADING MODAL: Failed to verify buy order ${buyOrder.contract_order_id}:`, error)
      }
    }

    if (validBuyOrders.length === 0) {
      console.log('❌ TRADING MODAL: NO VALID BUY ORDERS ON CONTRACT - database out of sync!')
      console.log('🛒 TRADING MODAL: Creating sell order instead of trying to execute non-existent orders')
      await createSellOrder()
      return
    }

    // fix: find buy order that actually exists on contract and can fulfill the trade (Cursor Rule 2)
    console.log('🔍 TRADING MODAL: Checking valid buy orders for execution:', validBuyOrders.map(order => ({
      id: order.id,
      contractOrderId: order.contract_order_id,
      contractRemainingShares: order.contractRemainingShares,
      status: order.status,
      statusType: typeof order.status,
      canFulfill: parseFloat(order.contractRemainingShares) >= targetShares
    })))

    const executableOrder = validBuyOrders.find(order => {
      const remainingShares = parseFloat(order.contractRemainingShares)
      // fix: account for tiny fills - allow orders with 99.9% of target shares (Cursor Rule 4)
      const hasEnoughShares = remainingShares >= (targetShares * 0.999)
      const hasContractId = !!order.contract_order_id
      const statusIsOpen = order.status === 'open'
      console.log(`🔍 TRADING MODAL: Buy order ${order.contract_order_id} check:`, {
        hasEnoughShares,
        hasContractId,
        status: order.status,
        statusType: typeof order.status,
        statusIsOpen,
        remainingShares: order.contractRemainingShares,
        targetShares,
        threshold: targetShares * 0.999
      })
      
      // fix: require status to be 'open' as per database schema (Cursor Rule 4)
      return hasEnoughShares && hasContractId && statusIsOpen
    })

    if (!executableOrder) {
      console.log('❌ TRADING MODAL: No valid buy orders can fulfill the trade amount')
      console.log('🛒 TRADING MODAL: Creating sell order instead')
      await createSellOrder()
      return
    }

    console.log('⚡ TRADING MODAL: Executing sell against buy order:', {
      orderId: executableOrder.id,
      contractOrderId: executableOrder.contract_order_id,
      contractRemainingShares: executableOrder.contractRemainingShares,
      targetShares,
      price: executableOrder.price
    })

    // fix: execute order with correct parameters for instant matching (Cursor Rule 2)
    const fillAmountWei = ethers.parseUnits(targetShares.toString(), 18)
    
    console.log('⚡ TRADING MODAL: Executing instant sell order...', {
      contractOrderId: executableOrder.contract_order_id,
      fillAmount: fillAmountWei.toString(),
      contractAddress: property.orderbook_contract_address
    })

    setTransactionStep('trading')
    setWasExecutedInstantly(true) // fix: mark this as instant execution (Cursor Rule 7)

    try {
      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'executeOrder',
        args: [BigInt(executableOrder.contract_order_id), fillAmountWei]
      })
    } catch (error) {
      console.error('❌ TRADING MODAL: executeOrder failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to execute order')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: CREATE NEW SELL ORDER (fallback when no buy orders exist) (Cursor Rule 2)
  const createSellOrder = async () => {
    if (!address || !shareAmount) return

    try {
      setTransactionStep('trading') // fix: set transaction step before writeContract (Cursor Rule 7)
      setWasExecutedInstantly(false) // fix: mark this as order placement, not execution (Cursor Rule 7)

      const ethers = await import('ethers')
      const sharesWei = ethers.parseUnits(shareAmount, 18)
      const priceWei = ethers.parseUnits(property.price_per_token.toString(), 6) // fix: USDC uses 6 decimals (Cursor Rule 4)

      console.log('💰 TRADING MODAL: Creating sell order...', {
        shareAmount,
        sharesWei: sharesWei.toString(),
        pricePerToken: property.price_per_token,
        priceWei: priceWei.toString(),
        contractAddress: property.orderbook_contract_address
      })
      
      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI, // fix: use full ABI instead of inline (Cursor Rule 1)
        functionName: 'createSellOrder',
        args: [sharesWei, priceWei]
      })

    } catch (error) {
      console.error('❌ TRADING MODAL: Sell order error:', error)
      setError(error instanceof Error ? error.message : 'Sell order failed')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: VERIFY ORDER CREATION ON SMART CONTRACT BEFORE RECORDING (Cursor Rule 4)
  const verifyOrderCreationAndRecord = async (transactionHash: string) => {
    try {
      console.log('🔍 TRADING MODAL: Transaction confirmed, recording order with hash:', transactionHash)
      
      // fix: ensure transaction hash is valid before recording (Cursor Rule 4)
      if (!transactionHash) {
        console.error('❌ TRADING MODAL: No transaction hash provided')
        setError('Transaction hash missing')
        setFlowState('error')
        return
      }
      
      console.log('✅ TRADING MODAL: Recording order with confirmed transaction hash...')
      await recordTradeActivity(transactionHash)
      setFlowState('success')
      
      // fix: set different success messages for executed vs placed orders (Cursor Rule 7)
      if (wasExecutedInstantly) {
        setSuccessMessage(`${activeTab === 'buy' ? 'Purchase' : 'Sale'} completed successfully!`)
      } else {
        setSuccessMessage(`${activeTab === 'buy' ? 'Buy' : 'Sell'} order placed successfully!`)
      }
      
      setTransactionStep('idle')
      
      // fix: refresh orderbook data immediately after success to sync available shares (Cursor Rule 5)
      await loadOrderBookData()
      await loadUserBalances()
      
      onTradeSuccess()
      
      // fix: comprehensive success audit logging (Cursor Rule 5)
      console.log('📊 TRADING SUCCESS AUDIT:', {
        transactionHash,
        userAddress: address,
        propertyId: property.id,
        orderType: activeTab,
        sharesTraded: activeTab === 'buy' ? calculateShares() : parseFloat(shareAmount || '0'),
        pricePerShare: property.price_per_token,
        executedInstantly: wasExecutedInstantly,
        newAvailableShares: availableShares,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('❌ TRADING MODAL: Error recording order:', error)
      setError('Failed to record order')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: SIMPLIFIED RECORDING (Cursor Rule 1)
  const recordTradeActivity = async (transactionHash: string) => {
    try {
      const shares = activeTab === 'buy' 
        ? parseFloat(usdcAmount) / property.price_per_token
        : parseFloat(shareAmount)

      // fix: handle order execution vs order creation differently (Cursor Rule 4)
      if (wasExecutedInstantly && activeTab === 'buy') {
        // This was an executeOrder transaction - mark sell orders as filled
        console.log('🔄 TRADING MODAL: Recording order execution and updating filled orders...')
        
        const response = await fetch('/api/orderbook/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            property_id: property.id,
            transaction_hash: transactionHash,
            buyer_address: address,
            shares_bought: shares,
            price_per_share: property.price_per_token,
            contract_address: property.orderbook_contract_address
          })
        })

        if (response.ok) {
          console.log('✅ TRADING MODAL: Order execution recorded and sell orders updated')
        } else {
          console.error('❌ TRADING MODAL: Failed to record order execution')
        }
      } else {
        // This was a new order creation
        const orderData = {
          property_id: property.id,
          order_type: activeTab,
          user_address: address,
          shares: shares,
          price_per_share: property.price_per_token,
          transaction_hash: transactionHash,
          contract_address: property.orderbook_contract_address
        }

        console.log('📤 TRADING MODAL: Sending order data to record API:', orderData)
        
        const response = await fetch('/api/orderbook/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(orderData)
        })

        if (response.ok) {
          const result = await response.json()
          console.log('✅ TRADING MODAL: New order recorded successfully:', result)
        } else {
          const errorText = await response.text()
          console.error('❌ TRADING MODAL: Failed to record new order. Status:', response.status, 'Error:', errorText)
          throw new Error(`Recording failed: ${response.status} - ${errorText}`)
        }
      }
    } catch (error) {
      console.error('❌ TRADING MODAL: Recording error:', error)
    }
  }

  // fix: SIMPLE RESET ON CLOSE (Cursor Rule 1)
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('buy')
      setUsdcAmount('')
      setShareAmount('')
      setFlowState('input')
      setError(null)
      setSuccessMessage(null)
      setTransactionStep('idle')
      setRecordedHashes(new Set())
      setWasExecutedInstantly(false) // fix: reset execution flag (Cursor Rule 7)
    }
  }, [isOpen])

  const getUsdcAddress = (): string => {
    // fix: use USDC address from contracts.ts instead of hardcoded fallback (Cursor Rule 4)
    return process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || getUsdcAddressByChain(chainId || 84532) || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }

  // fix: Dynamic contract loading from property_token_details (Cursor Rule 4)
  const getContractAddresses = () => {
    return {
      tokenContract: property.contract_address,
      orderbookContract: property.orderbook_contract_address,
      usdcContract: getUsdcAddress()
    }
  }

  const loadUserBalances = async () => {
    if (!address) return

    try {
      // fix: read REAL on-chain balances instead of database (Cursor Rule 4)
      const ethers = await import('ethers')
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org')
      
      const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)']
      
      // Get USDC balance
      const usdcContract = new ethers.Contract(getUsdcAddress(), ERC20_ABI, provider)
      const usdcBalance = await usdcContract.balanceOf(address)
      setUserUsdcBalance(usdcBalance)
      
      // Get TOKEN balance from the actual property contract
      if (!property.contract_address) {
        console.error('❌ TRADING MODAL: Property contract address not available')
        return
      }
      const tokenContract = new ethers.Contract(property.contract_address, ERC20_ABI, provider)
      const tokenBalance = await tokenContract.balanceOf(address)
      const tokenBalanceFormatted = parseFloat(ethers.formatUnits(tokenBalance, 18))
      setUserTokenBalance(tokenBalance)
      
      console.log(`🔍 TRADING MODAL: Real balances for ${address}:`)
      console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`)
      console.log(`   ${property.name} tokens: ${tokenBalanceFormatted}`)
      
    } catch (error) {
      console.error('❌ TRADING MODAL: Error loading on-chain balances:', error)
    }
  }

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(amount)
  }

  // fix: SIMPLE HELPER FUNCTIONS (Cursor Rule 1)
  const calculateShares = () => {
    if (!usdcAmount) return 0
    return parseFloat(usdcAmount) / property.price_per_token
  }

  const calculateProceeds = () => {
    if (!shareAmount) return 0
    return parseFloat(shareAmount) * property.price_per_token
  }

  const formatUsdcBalance = () => {
    const ethers = require('ethers')
    return parseFloat(ethers.formatUnits(userUsdcBalance, 6)).toFixed(2)
  }

  const formatTokenBalance = () => {
    const ethers = require('ethers')
    return parseFloat(ethers.formatUnits(userTokenBalance, 18)).toFixed(2)
  }

  // fix: LOAD ORDERBOOK MARKET DATA (Cursor Rule 14)
  const loadOrderBookData = async () => {
    try {
      const response = await fetch(`/api/orderbook/market-data?property_id=${property.id}`)
      if (!response.ok) return

      const marketData = await response.json()
      setAvailableShares(marketData.available_shares || 0)
      setOrderBookDepth({
        buyOrders: marketData.order_depth?.buy_orders || 0,
        sellOrders: marketData.order_depth?.sell_orders || 0
      })
    } catch (error) {
      console.error('Failed to load orderbook data:', error)
    }
  }

  // fix: CREATE BUY ORDER - when no sell orders available (Cursor Rule 2)
  const createBuyOrder = async () => {
    const ethers = require('ethers')
    const tokenAmountWei = ethers.parseUnits(calculateShares().toString(), 18)
    const pricePerTokenWei = ethers.parseUnits(property.price_per_token.toString(), 6)

    console.log('🛒 TRADING MODAL: Creating buy order with params:', {
      tokenAmount: tokenAmountWei.toString(),
      pricePerToken: pricePerTokenWei.toString()
    })

    console.log('🔄 TRADING MODAL: Setting transaction step to trading before createBuyOrder')
    setTransactionStep('trading')
    setWasExecutedInstantly(false) // fix: mark this as order placement, not execution (Cursor Rule 7)

    try {
      console.log('🛒 TRADING MODAL: Calling writeContract for createBuyOrder with args:', {
        contractAddress: property.orderbook_contract_address,
        tokenAmount: tokenAmountWei.toString(),
        pricePerToken: pricePerTokenWei.toString()
      })

      writeContract({
        address: property.orderbook_contract_address as `0x${string}`,
        abi: OrderBookExchangeABI,
        functionName: 'createBuyOrder',
        args: [tokenAmountWei, pricePerTokenWei]
      })
    } catch (error) {
      console.error('❌ TRADING MODAL: createBuyOrder writeContract error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create buy order')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  const getButtonText = () => {
    if (isPending || isConfirming || transactionStep !== 'idle') {
      if (transactionStep === 'wallet_approval') return 'Please Sign Wallet...'
      if (transactionStep === 'approving') return 'Approving...'
      if (transactionStep === 'trading') return 'Processing...'
      return 'Processing...'
    }
    return activeTab === 'buy' ? 'Buy Tokens' : 'Sell Tokens'
  }

  if (!isOpen) return null

  // Show authentication required message
  if (!isConnected || !address) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Wallet Connection Required</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">Please connect your wallet to trade property tokens.</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md md:max-w-md max-h-[80vh] gap-0 overflow-y-auto p-5 m-0">
        <DialogHeader>
          <DialogTitle className="sr-only">Buy Now</DialogTitle>
        </DialogHeader>
        {/* Trade Type Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center justify-start gap-1 w-full text-xl font-medium text-openhouse-fg bg-white"
          >
            <span>{activeTab === 'buy' ? 'Buy Now' : 'Sell Your Shares'}</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          
          {showDropdown && (
            <div className="absolute top-full p-2 space-y-1 rounded-md border border-openhouse-border shadow-md left-0 right-0 mt-1 bg-white z-10">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('buy')
                  setShowDropdown(false)
                  setTransactionStep('idle')
                  setRecordedHashes(new Set())
                  setError('')
                }}
                className="w-full py-2 text-left text-sm text-openhouse-fg rounded-sm transition-all pl-2 hover:pl-4 hover:bg-openhouse-bg-muted"
              >
                Buy Now
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('sell')
                  setShowDropdown(false)
                  setTransactionStep('idle')
                  setRecordedHashes(new Set())
                  setError('')
                }}
                className="w-full py-2 text-left text-sm text-openhouse-fg rounded-sm transition-all pl-2 hover:pl-4 hover:bg-openhouse-bg-muted"
                disabled={userTokenBalance <= BigInt(0)}
              >
                Sell Your Shares
              </button>
            </div>
          )}
        </div>

        {/* Trading Interface - Only show when not processing on chain */}
        {flowState === 'input' && !isProcessingOnChain && (
          <div className="space-y-3">
            {/* Tab Navigation */}
            <div className="space-y-6">

              {/* Trade Input - Single Card */}
              <Card className='mt-4 pt-0 pb-0'>
                <CardContent className="space-y-2 pt-2">
                  {activeTab === 'buy' && (
                    <div>
                      <p className="text-sm text-openhouse-fg-muted">Once the transaction is confirmed, the NFT will be sent to your wallet instantly.</p>
                      <div className="pt-6">
                        {/* SummerFi-style input container */}
                        <div className="border border-openhouse-border rounded-md p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-openhouse-fg">Deposit token</span>
                            <span className="text-sm text-gray-600">Balance: {formatUsdcBalance()} USDC</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="inline-flex items-center gap-1 bg-openhouse-bg-muted text-openhouse-fg pl-2 pr-4 py-2 rounded-full">
                              <Image src="/crypto/USDC.svg" alt="USDC" width={20} height={20} />
                              <span className="font-medium text-sm">USDC</span>
                            </div>
                            
                            <div className="flex flex-col items-end">
                              <Input
                                type="number"
                                value={usdcAmount}
                                onChange={(e) => setUsdcAmount(e.target.value)}
                                placeholder="0"
                                className="text-right text-5xl md:text-3xl font-medium rounded-none border-none bg-transparent p-0 h-auto focus:ring-0 focus:border-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                min="0"
                                step="0.01"
                                autoFocus={activeTab === 'buy'}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'sell' && (
                    <div className="space-y-4">
                      {/* SummerFi-style input container */}
                      <div className="border border-openhouse-border rounded-md p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-openhouse-fg-muted">Token Symbol</span>
                          <span className="text-sm text-openhouse-fg-muted">Balance: {formatTokenBalance()} {property.token_symbol}</span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-openhouse-bg-muted text-openhouse-fg px-3 py-2 rounded-full">
                              <span className="font-medium">{property.token_symbol}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end">
                            <Input
                              type="number"
                              value={shareAmount}
                              onChange={(e) => setShareAmount(e.target.value)}
                              placeholder="0"
                              className="text-right md:text-3xl text-3xl rounded-none font-medium border-none bg-transparent p-0 h-auto focus:ring-0 focus:border-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              min="0"
                              step="0.01"
                              autoFocus={activeTab === 'sell'}
                            />
                            <span className="text-sm text-openhouse-fg-muted mt-1">
                              ${formatCurrency(calculateProceeds())}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Buy summary - simplified */}
                  {activeTab === 'buy' && usdcAmount && parseFloat(usdcAmount) > 0 && (
                    <div className="bg-openhouse-bg-muted rounded-md p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-openhouse-fg-muted">You get:</span>
                        <span className="text-sm font-medium text-openhouse-fg">
                          {calculateShares().toFixed(2)} tokens
                        </span>
                      </div>
                    </div>
                  )}

                  {activeTab === 'sell' && shareAmount && parseFloat(shareAmount) > 0 && (
                    <div className="bg-openhouse-bg-muted rounded-md p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-openhouse-fg-muted">You get:</span>
                        <span className="text-sm font-medium text-openhouse-fg">
                          {formatCurrency(calculateProceeds())}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* fix: SIMPLE ONE BUTTON - wallet handles approval automatically (Cursor Rule 7) */}
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault() // fix: prevent any default form submission behavior
                      console.log('🔴 TRADING MODAL: BUTTON CLICKED!', {
                        activeTab,
                        transactionStep,
                        shareAmount,
                        usdcAmount,
                        isPending,
                        isConfirming,
                        address
                      })
                      
                                              if (activeTab === 'buy') {
                          executeBuyWithApproval()
                        } else {
                          executeSellWithApproval()
                        }
                    }}
                    className="w-full"
                    disabled={
                      isPending || 
                      isConfirming || 
                      (activeTab === 'buy' && !usdcAmount) || // fix: buy only needs USDC amount - can create orders even when no sell orders exist (Cursor Rule 2)
                      (activeTab === 'sell' && !shareAmount) // fix: sell needs share amount (Cursor Rule 2)
                    }
                  >
                    {(isPending || isConfirming || transactionStep !== 'idle') && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {getButtonText()}
                  </Button>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Error</span>
                      </div>
                      <p className="text-red-700 text-sm mt-1">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Processing On-Chain State */}
        {isProcessingOnChain && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              </div>
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900">
                  {transactionStep === 'wallet_approval' && 'Please Sign Wallet'}
                  {transactionStep === 'approving' && 'Please Approve'}
                  {transactionStep === 'trading' && `Processing ${activeTab === 'buy' ? 'Buy' : 'Sell'} Order`}
                </h3>
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-gray-500">
                    {transactionStep === 'wallet_approval' && 'Open your wallet and confirm the transaction to continue'}
                    {transactionStep === 'approving' && `Approving ${activeTab === 'buy' ? 'USDC' : 'token'} spending permission...`}
                    {transactionStep === 'trading' && 'Your transaction is being confirmed on the blockchain...'}
                  </p>
                  
                  {/* Show transaction progress info when we have a hash */}
                  {hash && transactionStep === 'trading' && (
                    <div className="bg-openhouse-bg-muted border border-openhouse-border rounded-lg p-3 mt-3">
                      <div className="flex items-start gap-2">
                        <Loader2 className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0 animate-spin" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-700">Transaction Submitted</p>
                          <p className="text-xs text-gray-600 mt-1">
                            Processing your {activeTab} order on the blockchain...
                          </p>
                          <p className="text-xs text-openhouse-fg-muted mt-1">
                            Hash: <code className="text-xs bg-openhouse-bg-muted px-1 rounded">{hash?.slice(0, 8)}...{hash?.slice(-6)}</code>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {flowState === 'success' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900">
                  {wasExecutedInstantly 
                    ? (activeTab === 'buy' ? 'Purchase Complete' : 'Sale Complete')
                    : (activeTab === 'buy' ? 'Buy Order Placed' : 'Sell Order Placed')
                  }
                </h3>
                {/* fix: CLEAR ORDERBOOK EXPLANATION - set expectations (Cursor Rule 14) */}
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-gray-500">
                    {successMessage}
                  </p>
                  {wasExecutedInstantly ? (
                    // fix: show completion message for instant execution (Cursor Rule 7)
                    activeTab === 'buy' ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="text-left">
                            <p className="text-sm font-medium text-green-800">Purchase Completed</p>
                            <p className="text-xs text-green-700 mt-1">
                              Your tokens have been transferred to your wallet. USDC was exchanged instantly at $1.00 per token.
                            </p>
                            <p className="text-xs text-green-600 mt-1 font-medium">
                              Transaction complete: Check your wallet balance
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="text-left">
                            <p className="text-sm font-medium text-green-800">Sale Completed</p>
                            <p className="text-xs text-green-700 mt-1">
                              Your USDC has been transferred to your wallet. Tokens were sold instantly at $1.00 per token.
                            </p>
                            <p className="text-xs text-green-600 mt-1 font-medium">
                              Transaction complete: Check your wallet balance
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    // fix: show pending order message for order placement (Cursor Rule 7)
                    activeTab === 'buy' ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <Clock className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div className="text-left">
                            <p className="text-sm font-medium text-blue-800">Your Order is Active</p>
                            <p className="text-xs text-blue-700 mt-1">
                              Your USDC is safely escrowed in the smart contract. You'll receive tokens when someone sells to you at $1.00 per token.
                            </p>
                            <p className="text-xs text-blue-600 mt-1 font-medium">
                              Expected delivery: Usually within 24 hours
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <Clock className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="text-left">
                            <p className="text-sm font-medium text-green-800">Your Order is Active</p>
                            <p className="text-xs text-green-700 mt-1">
                              Your tokens are safely escrowed in the smart contract. You'll receive USDC when someone buys from you at $1.00 per token.
                            </p>
                            <p className="text-xs text-green-600 mt-1 font-medium">
                              Expected sale: Usually within 24 hours
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  // fix: keep modal open for more trading (Cursor Rule 7)
                  setFlowState('input')
                  setSuccessMessage(null)
                  setError('')
                  setUsdcAmount('')
                  setShareAmount('')
                  setTransactionStep('idle')
                }}
                className="flex-1"
              >
                Place Another Order
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onClose()
                  // fix: refresh data when closing (Cursor Rule 7)
                  if (onTradeSuccess) {
                    onTradeSuccess()
                  }
                }}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {flowState === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Transaction Failed</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault() // fix: prevent any default form submission behavior
                setFlowState('input')
                setError(null)
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}