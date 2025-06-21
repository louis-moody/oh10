'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { ArrowRightLeft, TrendingUp, TrendingDown, AlertCircle, CheckCircle, DollarSign, ExternalLink } from 'lucide-react'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { LoadingState } from './LoadingState'

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
  // fix: SIMPLE USDC AMOUNT INPUT ONLY (Cursor Rule 1)
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

  // Load user balances
  useEffect(() => {
    if (address && isOpen) {
      loadUserBalances()
      loadOrderbookStatus()
    }
  }, [address, isOpen])

  const getUsdcAddress = () => {
    return process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
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
      
      console.log(`🔍 Real balances for ${address}:`)
      console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`)
      console.log(`   ${property.name} tokens: ${tokenBalanceFormatted}`)
      
    } catch (error) {
      console.error('Error loading on-chain balances:', error)
    }
  }

  const loadOrderbookStatus = async () => {
    // fix: check orderbook availability directly from property (Cursor Rule 4)
    setOrderbookEnabled(!!property.orderbook_contract_address)
  }

  // fix: REAL WALLET TRANSACTION - NO FAKE ACTIONS (Cursor Rule 1)
  const executeTrade = async () => {
    console.log('🚀 executeTrade called', { 
      address, 
      orderbook: property.orderbook_contract_address,
      activeTab,
      usdcAmount,
      shareAmount
    })

    if (!address || !property.orderbook_contract_address) {
      console.log('❌ Missing address or orderbook contract')
      return
    }

    // fix: validate inputs based on trade type (Cursor Rule 7)
    if (activeTab === 'buy') {
      if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
        console.log('❌ Invalid USDC amount')
        setError('Please enter a valid USDC amount')
        return
      }
    } else {
      if (!shareAmount || parseFloat(shareAmount) <= 0) {
        console.log('❌ Invalid share amount')
        setError('Please enter a valid number of shares to sell')
        return
      }
    }

    console.log('✅ Validation passed, setting executing state')
    setFlowState('executing')
    setError('')

    try {
      const ethers = await import('ethers')
      
      if (activeTab === 'buy') {
        const usdcAmountWei = ethers.parseUnits(usdcAmount, 6)
        const priceWei = ethers.parseUnits(property.price_per_token.toString(), 18)
        const tokenAmount = ethers.parseUnits((parseFloat(usdcAmount) / property.price_per_token).toString(), 18)
        
        console.log('💰 Buy order params:', {
          usdcAmountWei: usdcAmountWei.toString(),
          priceWei: priceWei.toString(),
          tokenAmount: tokenAmount.toString(),
          orderbook: property.orderbook_contract_address
        })
        
        // fix: DIRECT WALLET CALL - createBuyOrder (Cursor Rule 1)
        console.log('📞 Calling writeContract for buy order...')
        writeContract({
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
      } else {
        const sharesWei = ethers.parseUnits(shareAmount, 18)
        const priceWei = ethers.parseUnits(property.price_per_token.toString(), 18)
        
        console.log('💰 Sell order params:', {
          sharesWei: sharesWei.toString(),
          priceWei: priceWei.toString(),
          orderbook: property.orderbook_contract_address
        })
        
        // fix: DIRECT WALLET CALL - createSellOrder (Cursor Rule 1)
        console.log('📞 Calling writeContract for sell order...')
        writeContract({
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
      }
      
    } catch (error) {
      console.error('Trade execution error:', error)
      setError(error instanceof Error ? error.message : 'Trade execution failed')
      setFlowState('error')
    }
  }

  // fix: handle transaction states (Cursor Rule 1)
  useEffect(() => {
    if (writeError) {
      console.log('❌ Write error:', writeError)
      setError(writeError.message)
      setFlowState('error')
    }
  }, [writeError])

  useEffect(() => {
    if (hash) {
      console.log('📝 Transaction hash received:', hash)
    }
  }, [hash])

  useEffect(() => {
    if (isPending) {
      console.log('⏳ Transaction pending...')
    }
  }, [isPending])

  useEffect(() => {
    if (isConfirming) {
      console.log('🔄 Transaction confirming...')
    }
  }, [isConfirming])

  useEffect(() => {
    if (isConfirmed) {
      console.log('✅ Transaction confirmed!')
      setFlowState('success')
      setSuccessMessage(`${activeTab === 'buy' ? 'Buy' : 'Sell'} order placed successfully!`)
      
      setTimeout(() => {
        onTradeSuccess()
        onClose()
      }, 3000)
    }
  }, [isConfirmed, activeTab, onTradeSuccess, onClose])

  // fix: calculate shares from USDC amount at OpenHouse price (Cursor Rule 1)
  const calculateShares = () => {
    if (!usdcAmount || !property.price_per_token) return 0
    return parseFloat(usdcAmount) / property.price_per_token
  }

  // fix: calculate USDC proceeds from shares at OpenHouse price (Cursor Rule 1)
  const calculateProceeds = () => {
    if (!shareAmount || !property.price_per_token) return 0
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
      setActiveTab('buy')
      setUsdcAmount('')
      setShareAmount('')
      setFlowState('input')
      setError(null)
      setSuccessMessage(null)
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

        {flowState === 'input' && orderbookEnabled && (
          <div className="space-y-4">
            {/* Balance Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Your Balances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">USDC:</span>
                  <span className="text-sm font-medium">${formatUsdcBalance()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{property.name} tokens:</span>
                  <span className="text-sm font-medium">{userTokenBalance.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Trade Input */}
            <Card>
              <CardContent className="space-y-4">
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

                {/* fix: show cost/proceeds based on trade type (Cursor Rule 1) */}
                {activeTab === 'buy' && usdcAmount && parseFloat(usdcAmount) > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-800">You will receive:</span>
                      <span className="text-lg font-semibold text-green-900">
                        {calculateShares().toFixed(2)} shares
                      </span>
                    </div>
                    <p className="text-xs text-green-700 mt-1">
                      At fixed price: {formatCurrency(property.price_per_token)} per share
                    </p>
                  </div>
                )}

                {activeTab === 'sell' && shareAmount && parseFloat(shareAmount) > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-red-800">You will receive:</span>
                      <span className="text-lg font-semibold text-red-900">
                        {formatCurrency(calculateProceeds())}
                      </span>
                    </div>
                    <p className="text-xs text-red-700 mt-1">
                      At fixed price: {formatCurrency(property.price_per_token)} per share
                    </p>
                  </div>
                )}

                <Button
                  onClick={executeTrade}
                  disabled={
                    isPending || isConfirming ||
                    (activeTab === 'buy' 
                      ? !usdcAmount || parseFloat(usdcAmount) <= 0
                      : !shareAmount || parseFloat(shareAmount) <= 0)
                  }
                  className={`w-full ${
                    activeTab === 'buy' 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isPending || isConfirming 
                    ? 'Processing...' 
                    : activeTab === 'buy' 
                      ? `Buy Shares for $${usdcAmount || '0'}` 
                      : `Sell ${shareAmount || '0'} Shares`
                  }
                </Button>

                <div className="text-xs text-gray-500 space-y-1">
                  <p>• Fixed price trading at OpenHouse rates</p>
                  <p>• Instant execution when you have sufficient balance</p>
                  <p>• 0.5% protocol fee applies to all trades</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {(flowState === 'executing' || isPending || isConfirming) && (
          <div className="py-8">
            <LoadingState />
            <div className="text-center mt-4">
              {isPending && (
                <div>
                  <p className="text-gray-800 font-medium">Check your wallet to sign the transaction</p>
                  <p className="text-gray-500 text-sm mt-1">This should take just a few seconds</p>
                </div>
              )}
              {isConfirming && (
                <div>
                  <p className="text-gray-800 font-medium">Transaction submitted to blockchain</p>
                  <p className="text-gray-500 text-sm mt-1">Confirming on Base Sepolia - usually takes 30-60 seconds</p>
                  {hash && (
                    <a 
                      href={`https://sepolia.basescan.org/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-flex items-center gap-1"
                    >
                      View on BaseScan <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {flowState === 'executing' && !isPending && !isConfirming && (
                <p className="text-gray-600">Preparing transaction...</p>
              )}
            </div>
          </div>
        )}

        {flowState === 'success' && successMessage && (
          <div className="py-8">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <p className="text-green-800 font-medium">Order Placed!</p>
                <p className="text-green-700 text-sm mt-1">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {flowState === 'error' && error && (
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-red-800 font-medium">Trade Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
            
            <Button
              onClick={() => setFlowState('input')}
              className="w-full mt-4"
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}