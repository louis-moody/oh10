#!/usr/bin/env node

// Script to approve USDC spending for testing the secure reservation flow
require('dotenv').config({ path: '.env.local' })
const { createWalletClient, createPublicClient, http, parseUnits } = require('viem')
const { baseSepolia } = require('viem/chains')
const { privateKeyToAccount } = require('viem/accounts')

const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
]

async function approveUSDC() {
  console.log('🚀 Starting USDC approval for testing...\n')

  // Get configuration
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
  const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY

  if (!usdcAddress || !treasuryAddress || !privateKey) {
    console.error('❌ Missing environment variables')
    return
  }

  const account = privateKeyToAccount(privateKey)
  
  console.log('📋 Configuration:')
  console.log(`   Your Wallet: ${account.address}`)
  console.log(`   Treasury: ${treasuryAddress}`)
  console.log(`   USDC Contract: ${usdcAddress}`)

  // Create clients
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  })

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  })

  try {
    // Check current balance
    console.log('\n💰 Checking USDC balance...')
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    })

    const balanceUSDC = Number(balance) / 1_000_000
    console.log(`   Balance: ${balanceUSDC} USDC`)

    if (balanceUSDC < 50) {
      console.log('⚠️  You need at least 50 USDC to test the full reservation flow')
      console.log('   But we can approve whatever you have for testing...')
    }

    // Check current allowance
    console.log('\n🔍 Checking current allowance...')
    const currentAllowance = await publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [account.address, treasuryAddress]
    })

    const allowanceUSDC = Number(currentAllowance) / 1_000_000
    console.log(`   Current allowance: ${allowanceUSDC} USDC`)

    // Determine approval amount (approve your full balance for testing)
    const approvalAmount = balance // Approve full balance
    const approvalUSDC = Number(approvalAmount) / 1_000_000

    console.log(`\n✅ Approving ${approvalUSDC} USDC for treasury spending...`)

    // Execute approval
    const approvalHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [treasuryAddress, approvalAmount]
    })

    console.log(`⏳ Transaction submitted: ${approvalHash}`)
    console.log(`   View on BaseScan: https://sepolia.basescan.org/tx/${approvalHash}`)

    // Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...')
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: approvalHash
    })

    if (receipt.status === 'success') {
      console.log('✅ USDC approval successful!')
      console.log(`\n🎯 TEST DATA FOR RESERVATION:`)
      console.log(`   Approval Hash: ${approvalHash}`)
      console.log(`   Wallet Address: ${account.address}`)
      console.log(`   Approved Amount: ${approvalUSDC} USDC`)
      console.log(`   Treasury: ${treasuryAddress}`)
      
      console.log(`\n📝 You can now test the reservation with:`)
      console.log(`   - Property: London Flat (if you want to test on flagged property)`)
      console.log(`   - Property: Manchester Studio (for clean testing)`)
      console.log(`   - USDC Amount: ${Math.min(50, approvalUSDC)} (or less)`)
      console.log(`   - Approval Hash: ${approvalHash}`)
      
      console.log(`\n🔗 The system will verify this approval hash on-chain and should accept it!`)
    } else {
      console.log('❌ Transaction failed')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the approval
approveUSDC().catch(console.error) 