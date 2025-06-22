'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { ArrowRightLeft, TrendingUp, TrendingDown, AlertCircle, CheckCircle, DollarSign, ExternalLink } from 'lucide-react'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2 } from 'lucide-react'

interface TradingModalProps {
  isOpen: boolean
  onClose: () => void
  property: {
    id: string
    name: string
    price_per_token: number
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
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const [activeTab, setActiveTab] = useState<TradeTab>('buy')
  // fix: OpenHouse controls pricing - no user-defined prices (Cursor Rule 1)
  const [usdcAmount, setUsdcAmount] = useState('')
  const [shareAmount, setShareAmount] = useState('') // for sell only
  const [flowState, setFlowState] = useState<FlowState>('input')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // User balances
  const [userTokenBalance, setUserTokenBalance] = useState(0)
  const [userUsdcBalance, setUserUsdcBalance] = useState('0')

  // Orderbook status
  const [orderbookEnabled, setOrderbookEnabled] = useState(false)

  // fix: REAL WALLET CONTRACT INTERACTION (Cursor Rule 1)
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // fix: simple transaction state - no complex approval tracking (Cursor Rule 7)
  const [transactionStep, setTransactionStep] = useState<'idle' | 'approving' | 'trading'>('idle')
  
  // fix: prevent infinite loop with tracking state (Cursor Rule 6)
  const [hasRecorded, setHasRecorded] = useState(false)

  // Load user balances
  useEffect(() => {
    if (address && isOpen) {
      console.log('🔍 TRADING MODAL: Loading balances for:', {
        address,
        chainId,
        isConnected,
        propertyContract: property.contract_address,
        orderbookContract: property.orderbook_contract_address
      })
      loadUserBalances()
      loadOrderbookStatus()
    }
  }, [address, isOpen, chainId, isConnected])

  const getUsdcAddress = () => {
    return process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
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
      setUserUsdcBalance(usdcBalance.toString())
      
      // Get TOKEN balance from the actual property contract
      const tokenContract = new ethers.Contract(property.contract_address || '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F', ERC20_ABI, provider)
      const tokenBalance = await tokenContract.balanceOf(address)
      const tokenBalanceFormatted = parseFloat(ethers.formatUnits(tokenBalance, 18))
      setUserTokenBalance(tokenBalanceFormatted)
      
      console.log(`🔍 TRADING MODAL: Real balances for ${address}:`)
      console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`)
      console.log(`   ${property.name} tokens: ${tokenBalanceFormatted}`)
      
    } catch (error) {
      console.error('❌ TRADING MODAL: Error loading on-chain balances:', error)
    }
  }

  const loadOrderbookStatus = async () => {
    // fix: check orderbook availability directly from property (Cursor Rule 4)
    setOrderbookEnabled(!!property.orderbook_contract_address)
  }

  // fix: SIMPLE SELL FLOW - approve then sell in sequence (Cursor Rule 7)
  const executeSellWithApproval = async () => {
    console.log('🔴 TRADING MODAL: executeSellWithApproval called with:', {
      address,
      contractAddress: property.contract_address,
      orderbookAddress: property.orderbook_contract_address,
      shareAmount,
      isConnected,
      chainId,
      expectedChainId: 84532 // Base Sepolia
    })

    // fix: check if user is on correct network (Cursor Rule 6)
    if (chainId !== 84532) {
      console.log('🔴 TRADING MODAL: Wrong network:', { chainId, expected: 84532 })
      setError('Please switch to Base Sepolia network')
      setFlowState('error')
      return
    }

    if (!address || !property.contract_address || !property.orderbook_contract_address || !shareAmount) {
      console.log('🔴 TRADING MODAL: Missing required parameters:', {
        hasAddress: !!address,
        address,
        hasContractAddress: !!property.contract_address,
        contractAddress: property.contract_address,
        hasOrderbookAddress: !!property.orderbook_contract_address,
        orderbookAddress: property.orderbook_contract_address,
        hasShareAmount: !!shareAmount,
        shareAmount
      })
      setError('Missing required information for trade')
      setFlowState('error')
      return
    }

    try {
      console.log('🔴 TRADING MODAL: Setting transaction state to approving')
      setTransactionStep('approving')
      setFlowState('executing')
      
      console.log('🔴 TRADING MODAL: Importing ethers...')
      const ethers = await import('ethers')
      const requiredAmount = ethers.parseUnits(shareAmount, 18)
      
      console.log('📝 TRADING MODAL: Step 1: Approving tokens for sale', {
        tokenContract: property.contract_address,
        spender: property.orderbook_contract_address,
        amount: requiredAmount.toString(),
        shareAmount,
        shareAmountParsed: parseFloat(shareAmount)
      })

      console.log('🔴 TRADING MODAL: About to call writeContract...')
      // First approve tokens
      const result = writeContract({
        address: property.contract_address as `0x${string}`,
        abi: [
          {
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ],
        functionName: 'approve',
        args: [property.orderbook_contract_address as `0x${string}`, requiredAmount]
      })
      
      console.log('📝 TRADING MODAL: writeContract result:', result)
    } catch (error) {
      console.error('🔴 TRADING MODAL: Sell with approval error:', error)
      setTransactionStep('idle')
      setFlowState('error')
      setError(error instanceof Error ? error.message : 'Transaction failed')
    }
  }

  // fix: REAL WALLET TRANSACTION - NO FAKE ACTIONS (Cursor Rule 1)
  const executeTrade = async () => {
    console.log('🚀 TRADING MODAL: executeTrade called', { 
      address, 
      orderbook: property.orderbook_contract_address,
      activeTab,
      usdcAmount,
      shareAmount,
      isConnected,
      chainId
    })

    // fix: check if user is on correct network (Cursor Rule 6)
    if (chainId !== 84532) {
      setError('Please switch to Base Sepolia network')
      setFlowState('error')
      return
    }

    if (!address || !property.orderbook_contract_address) {
      console.log('❌ TRADING MODAL: Missing address or orderbook contract:', {
        hasAddress: !!address,
        hasOrderbook: !!property.orderbook_contract_address
      })
      return
    }

    // fix: validate inputs based on trade type (Cursor Rule 7)
    if (activeTab === 'buy') {
      if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
        console.log('❌ TRADING MODAL: Invalid USDC amount')
        setError('Please enter a valid USDC amount')
        return
      }
    } else {
      if (!shareAmount || parseFloat(shareAmount) <= 0) {
        console.log('❌ TRADING MODAL: Invalid share amount')
        setError('Please enter a valid number of shares to sell')
        return
      }
    }

    console.log('✅ TRADING MODAL: Validation passed, setting executing state')
    setFlowState('executing')
    setError('')

    try {
      const ethers = await import('ethers')

      if (activeTab === 'buy') {
        // fix: Use OpenHouse-controlled price, not user-defined price
        const tokenAmount = ethers.parseUnits((parseFloat(usdcAmount) / property.price_per_token).toString(), 18)
        const priceWei = ethers.parseUnits(property.price_per_token.toString(), 18)
        
        console.log('💰 TRADING MODAL: Buy order params with OpenHouse price:', {
          usdcAmount,
          openHousePrice: property.price_per_token,
          tokenAmount: tokenAmount.toString(),
          priceWei: priceWei.toString(),
          orderbook: property.orderbook_contract_address
        })
        
        // fix: DIRECT WALLET CALL - createBuyOrder with user price (Cursor Rule 1)
        console.log('📞 TRADING MODAL: Calling writeContract for buy order...')
        const buyResult = writeContract({
          address: property.orderbook_contract_address as `0x${string}`,
          abi: [
            {
              name: 'createBuyOrder',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'tokenAmount', type: 'uint256' },
                { name: 'pricePerToken', type: 'uint256' }
              ],
              outputs: []
            }
          ],
          functionName: 'createBuyOrder',
          args: [tokenAmount, priceWei]
        })
        console.log('📞 TRADING MODAL: Buy writeContract result:', buyResult)
      } else {
        // fix: Use OpenHouse-controlled price for sell orders (Cursor Rule 1)
        const sharesWei = ethers.parseUnits(shareAmount, 18)
        const priceWei = ethers.parseUnits(property.price_per_token.toString(), 18)
        
        console.log('💰 TRADING MODAL: Sell order params:', {
          sharesWei: sharesWei.toString(),
          priceWei: priceWei.toString(),
          orderbook: property.orderbook_contract_address
        })
        
        // fix: DIRECT WALLET CALL - createSellOrder (Cursor Rule 1)
        console.log('📞 TRADING MODAL: Calling writeContract for sell order...')
        const sellResult = writeContract({
          address: property.orderbook_contract_address as `0x${string}`,
          abi: [
            {
              name: 'createSellOrder',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'tokenAmount', type: 'uint256' },
                { name: 'pricePerToken', type: 'uint256' }
              ],
              outputs: []
            }
          ],
          functionName: 'createSellOrder',
          args: [sharesWei, priceWei]
        })
        console.log('📞 TRADING MODAL: Sell writeContract result:', sellResult)
      }
      
    } catch (error) {
      console.error('❌ TRADING MODAL: Trade execution error:', error)
      setError(error instanceof Error ? error.message : 'Trade execution failed')
      setFlowState('error')
      setTransactionStep('idle')
    }
  }

  // fix: handle transaction states with extensive logging (Cursor Rule 1)
  useEffect(() => {
    if (writeError) {
      console.log('❌ TRADING MODAL: Write error:', writeError)
      setError(writeError.message)
      setFlowState('error')
    }
  }, [writeError])

  useEffect(() => {
    if (hash) {
      console.log('📝 TRADING MODAL: Transaction hash received:', hash)
      // Reset recording flag when new transaction starts
      setHasRecorded(false)
    }
  }, [hash])

  useEffect(() => {
    if (isPending) {
      console.log('⏳ TRADING MODAL: Transaction pending...')
    }
  }, [isPending])

  useEffect(() => {
    if (isConfirming) {
      console.log('🔄 TRADING MODAL: Transaction confirming...')
    }
  }, [isConfirming])

  // fix: SINGLE TRANSACTION CONFIRMATION HANDLER with extensive logging
  useEffect(() => {
    console.log('🔄 TRADING MODAL: Transaction state change:', {
      isConfirmed,
      hasRecorded,
      transactionStep,
      activeTab,
      hash: hash?.slice(0, 10) + '...'
    })

    if (isConfirmed && !hasRecorded) {
      console.log('✅ TRADING MODAL: Transaction confirmed - starting processing')
      
      // fix: handle approval step vs final trade (Cursor Rule 7)
      if (transactionStep === 'approving' && activeTab === 'sell') {
        console.log('✅ TRADING MODAL: Approval confirmed! Now creating sell order...')
        setTransactionStep('trading')
        // Automatically proceed to sell order
        setTimeout(() => {
          executeTrade()
        }, 1000)
      } else {
        console.log('✅ TRADING MODAL: Final transaction confirmed - recording activity')
        // fix: prevent multiple calls with flag (Cursor Rule 6)
        setHasRecorded(true)
        recordTradeActivity()
        
        setFlowState('success')
        setSuccessMessage(`${activeTab === 'buy' ? 'Buy' : 'Sell'} order placed successfully!`)
        setTransactionStep('idle')
        
        setTimeout(() => {
          onTradeSuccess()
          onClose()
        }, 8000)
      }
    }
  }, [isConfirmed, hasRecorded, transactionStep, activeTab, hash])

  // fix: record orderbook transaction with comprehensive auth debugging (Cursor Rule 4)
  const recordTradeActivity = async () => {
    console.log('📝 TRADING MODAL: ===== STARTING RECORD TRADE ACTIVITY =====')
    
    try {
      // fix: validate required data before API call (Cursor Rule 6)
      if (!hash || !address || !property.orderbook_contract_address) {
        console.error('❌ TRADING MODAL: Missing required data for recording:', {
          hasHash: !!hash,
          hash: hash?.slice(0, 10) + '...',
          hasAddress: !!address,
          address: address?.slice(0, 6) + '...',
          hasContract: !!property.orderbook_contract_address,
          contract: property.orderbook_contract_address?.slice(0, 6) + '...'
        })
        return
      }

      console.log('📝 TRADING MODAL: Recording orderbook transaction with data:', {
        propertyId: property.id,
        activeTab,
        hash: hash.slice(0, 10) + '...',
        address: address.slice(0, 6) + '...',
        shareAmount,
        usdcAmount,
        openHousePrice: property.price_per_token
      })

      // fix: Calculate amounts using OpenHouse-controlled price (Cursor Rule 1)
      const shares = activeTab === 'buy' 
        ? parseFloat(usdcAmount) / property.price_per_token
        : parseFloat(shareAmount)

      // fix: validate calculated shares (Cursor Rule 6)
      if (!shares || shares <= 0) {
        console.error('❌ TRADING MODAL: Invalid shares calculated:', shares)
        return
      }

      // fix: Record in order_book table via API (Cursor Rule 4)
      const orderData = {
        property_id: property.id,
        order_type: activeTab,
        user_address: address,
        shares: shares,
        price_per_share: property.price_per_token,
        transaction_hash: hash,
        contract_address: property.orderbook_contract_address
      }

      console.log('📝 TRADING MODAL: Order data to send to API:', orderData)

      // fix: Check authentication before API call
      console.log('🔐 TRADING MODAL: Checking authentication status...')
      console.log('🔐 TRADING MODAL: Current cookies:', document.cookie)
      
      const response = await fetch('/api/orderbook/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Critical for cookie authentication
        body: JSON.stringify(orderData)
      })

      console.log('📝 TRADING MODAL: API Response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ TRADING MODAL: Orderbook transaction recorded successfully:', result)
      } else {
        const errorText = await response.text()
        console.error('❌ TRADING MODAL: Failed to record orderbook transaction:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        
        // fix: if authentication failed, show clear error (Cursor Rule 6)
        if (response.status === 401) {
          console.error('❌ TRADING MODAL: Authentication failed - user needs to reconnect wallet')
          setError('Authentication failed. Please reconnect your wallet and try again.')
        } else {
          setError(`Failed to record transaction: ${response.status} ${response.statusText}`)
        }
      }

    } catch (error) {
      console.error('❌ TRADING MODAL: Error in recordTradeActivity:', error)
      setError('Failed to record transaction. Please contact support.')
    }
    
    console.log('📝 TRADING MODAL: ===== FINISHED RECORD TRADE ACTIVITY =====')
  }

  // fix: calculate shares from USDC amount at OpenHouse-controlled price (Cursor Rule 1)
  const calculateShares = () => {
    if (!usdcAmount) return 0
    return parseFloat(usdcAmount) / property.price_per_token
  }

  // fix: calculate USDC proceeds from shares at OpenHouse-controlled price (Cursor Rule 1)
  const calculateProceeds = () => {
    if (!shareAmount) return 0
    return parseFloat(shareAmount) * property.price_per_token
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

  // Format USDC balance (6 decimals)
  const formatUsdcBalance = () => {
    const ethers = require('ethers')
    return parseFloat(ethers.formatUnits(userUsdcBalance, 6)).toFixed(2)
  }

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      console.log('🔄 TRADING MODAL: Modal closed - resetting all state')
      setActiveTab('buy')
      setUsdcAmount('')
      setShareAmount('')
      // fix: OpenHouse controls pricing - no user input needed
      setFlowState('input')
      setError(null)
      setSuccessMessage(null)
      setHasRecorded(false) // Reset recording flag
      setTransactionStep('idle')
    }
  }, [isOpen])

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
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Trade {property.name}
          </DialogTitle>
        </DialogHeader>

        {/* Trade Type Tabs */}
        <div className="flex space-x-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
              activeTab === 'buy'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-1" />
            Buy Tokens
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
              activeTab === 'sell'
                ? 'bg-white text-red-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            disabled={userTokenBalance <= 0}
          >
            <TrendingDown className="h-4 w-4 inline mr-1" />
            Sell Tokens
          </button>
        </div>

        {!orderbookEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-yellow-800 font-medium">Trading Not Available</p>
              <p className="text-yellow-700 text-sm">Trading has not been enabled for this property yet.</p>
            </div>
          </div>
        )}

        {(flowState === 'input' || flowState === 'executing') && orderbookEnabled && (
          <div className="space-y-6">
            {/* Balance Information - Compact */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Your Balances</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500">USDC</p>
                  <p className="text-lg font-semibold">${formatUsdcBalance()}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">{property.name} tokens</p>
                  <p className="text-lg font-semibold">{userTokenBalance.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Trade Input - Single Card */}
            <Card>
              <CardContent className="space-y-4 pt-6">
                {activeTab === 'buy' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">USDC Amount</label>
                    <Input
                      type="number"
                      value={usdcAmount}
                      onChange={(e) => setUsdcAmount(e.target.value)}
                      placeholder="Enter USDC amount"
                      className="mt-1"
                      min="0"
                      step="0.01"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Estimated shares: {calculateShares().toFixed(2)}
                    </p>
                  </div>
                )}

                {activeTab === 'sell' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Number of tokens</label>
                    <Input
                      type="number"
                      value={shareAmount}
                      onChange={(e) => setShareAmount(e.target.value)}
                      placeholder="Enter number of tokens"
                      className="mt-1"
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}

                {/* Price display - simplified */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-800">Price:</span>
                    <span className="text-lg font-semibold text-blue-900">
                      {formatCurrency(property.price_per_token)}
                    </span>
                  </div>
                </div>

                {/* Buy summary - simplified */}
                {activeTab === 'buy' && usdcAmount && parseFloat(usdcAmount) > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-800">You get:</span>
                      <span className="text-lg font-semibold text-green-900">
                        {calculateShares().toFixed(2)} tokens
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === 'sell' && shareAmount && parseFloat(shareAmount) > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-red-800">You get:</span>
                      <span className="text-lg font-semibold text-red-900">
                        {formatCurrency(calculateProceeds())}
                      </span>
                    </div>
                  </div>
                )}

                {/* fix: SIMPLE ONE BUTTON - wallet handles approval automatically (Cursor Rule 7) */}
                <Button
                  onClick={() => {
                    console.log('🔴 TRADING MODAL: BUTTON CLICKED!', {
                      activeTab,
                      transactionStep,
                      shareAmount,
                      usdcAmount,
                      isPending,
                      isConfirming,
                      address,
                      orderbookEnabled
                    })
                    
                    if (activeTab === 'sell') {
                      executeSellWithApproval()
                    } else {
                      executeTrade()
                    }
                  }}
                  disabled={isPending || isConfirming || !orderbookEnabled}
                  className={`w-full ${
                    activeTab === 'buy' 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  } text-white`}
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isPending ? 'Confirm in Wallet...' : 'Processing...'}
                    </>
                  ) : (
                    `${activeTab === 'buy' ? 'Buy' : 'Sell'} Tokens`
                  )}
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
        )}

        {flowState === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Transaction Successful!</h3>
            <p className="text-gray-600 mb-4">{successMessage}</p>
            <Button onClick={onClose} className="bg-green-600 hover:bg-green-700 text-white">
              Close
            </Button>
          </div>
        )}

        {flowState === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Transaction Failed</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button 
              onClick={() => {
                setFlowState('input')
                setError(null)
                setTransactionStep('idle')
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