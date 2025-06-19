const { createPublicClient, http, parseUnits, formatUnits } = require('viem')
const { baseSepolia } = require('viem/chains') 
const { privateKeyToAccount } = require('viem/accounts')

// fix: USDC contract ABI for approval checking (Cursor Rule 4)
const USDC_ABI = [
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "uint256"}]
  },
  {
    "type": "function", 
    "name": "approve",
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"name": "", "type": "bool"}]
  }
]

async function checkUSDCApprovals() {
  try {
    console.log('🔍 Checking USDC Approval Status\n')

    // fix: get addresses from environment (Cursor Rule 4)
    const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS
    const operatorPrivateKey = process.env.OPERATOR_PRIVATE_KEY
    const testWallet = '0xf8978edbab4e9f095581c0ab69c9e13acfd8d485' // From logs

    if (!usdcAddress || !operatorPrivateKey) {
      throw new Error('Missing environment variables: NEXT_PUBLIC_USDC_ADDRESS, OPERATOR_PRIVATE_KEY')
    }

    // fix: derive operator address from private key (Cursor Rule 4)
    const operatorAccount = privateKeyToAccount(operatorPrivateKey)
    console.log(`🔑 Operator Address (from private key): ${operatorAccount.address}`)
    console.log(`💳 USDC Contract: ${usdcAddress}`)
    console.log(`👤 Test Wallet: ${testWallet}\n`)

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    })

    // fix: check current allowance (Cursor Rule 4)
    const allowance = await publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [testWallet, operatorAccount.address]
    })

    console.log(`💰 Current Allowance: ${formatUnits(allowance, 6)} USDC`)
    console.log(`🎯 Required Amount: 50 USDC`)

    if (allowance >= parseUnits('50', 6)) {
      console.log('✅ Sufficient allowance exists!')
    } else {
      console.log('❌ Insufficient allowance!')
      console.log('\n🔧 To fix this issue:')
      console.log('1. User needs to make a new reservation with the correct operator address')
      console.log('2. Or manually approve more USDC for the operator')
      console.log(`3. Operator address: ${operatorAccount.address}`)
    }

  } catch (error) {
    console.error('❌ Error checking approvals:', error.message)
  }
}

// fix: run the check (Cursor Rule 4)
checkUSDCApprovals() 