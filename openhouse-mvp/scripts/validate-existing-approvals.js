#!/usr/bin/env node

// fix: validate all existing payment authorizations against on-chain data (Cursor Rule 4)
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { createPublicClient, http, parseAbi, decodeEventLog, isAddress } = require('viem')
const { baseSepolia } = require('viem/chains')

const USDC_ABI = parseAbi([
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
])

function getUSDCContractAddress() {
  const address = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
  if (!address || !isAddress(address)) {
    throw new Error('USDC contract address not configured or invalid')
  }
  return address
}

function getTreasuryAddress() {
  const address = process.env.NEXT_PUBLIC_TREASURY_ADDRESS
  if (!address || !isAddress(address)) {
    throw new Error('Treasury address not configured or invalid')
  }
  return address
}

async function verifyUSDCApproval(approvalHash, expectedOwner, expectedAmount) {
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    })

    const usdcAddress = getUSDCContractAddress()
    const treasuryAddress = getTreasuryAddress()

    console.log(`  Verifying hash: ${approvalHash}`)
    console.log(`  Expected owner: ${expectedOwner}`)
    console.log(`  Expected amount: ${expectedAmount} USDC`)

    const receipt = await publicClient.getTransactionReceipt({ 
      hash: approvalHash 
    })

    if (receipt.status !== 'success') {
      return { isValid: false, error: 'Transaction failed on-chain' }
    }

    const approvalLogs = receipt.logs.filter(log => 
      log.address.toLowerCase() === usdcAddress.toLowerCase()
    )

    if (approvalLogs.length === 0) {
      return { isValid: false, error: 'No USDC events found in transaction' }
    }

    for (const log of approvalLogs) {
      try {
        const decoded = decodeEventLog({
          abi: USDC_ABI,
          data: log.data,
          topics: log.topics
        })

        if (decoded.eventName === 'Approval') {
          const { owner, spender, value } = decoded.args

          const ownerMatches = owner.toLowerCase() === expectedOwner.toLowerCase()
          const spenderMatches = spender.toLowerCase() === treasuryAddress.toLowerCase()
          const amountMatches = Number(value) >= (expectedAmount * 1_000_000)

          console.log(`  Approval event found:`)
          console.log(`    Owner: ${owner} (matches: ${ownerMatches})`)
          console.log(`    Spender: ${spender} (matches: ${spenderMatches})`)
          console.log(`    Value: ${Number(value) / 1_000_000} USDC (sufficient: ${amountMatches})`)

          if (ownerMatches && spenderMatches && amountMatches) {
            return { isValid: true }
          }
        }
      } catch (decodeError) {
        continue
      }
    }

    return { isValid: false, error: 'No matching approval event found' }

  } catch (error) {
    return { isValid: false, error: `Verification failed: ${error.message}` }
  }
}

async function validateAllApprovals() {
  console.log('🔍 Starting validation of all payment authorizations...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Get all payment authorizations that claim to be approved
  const { data: approvals, error } = await supabase
    .from('payment_authorizations')
    .select('*')
    .eq('payment_status', 'approved')

  if (error) {
    console.error('❌ Failed to fetch payment authorizations:', error)
    return
  }

  console.log(`Found ${approvals.length} approved payment authorizations to validate\n`)

  let validCount = 0
  let invalidCount = 0
  const invalidApprovals = []

  for (const approval of approvals) {
    console.log(`\n📝 Validating approval ID: ${approval.id}`)
    console.log(`   Property: ${approval.property_id}`)
    console.log(`   Wallet: ${approval.wallet_address}`)
    console.log(`   Amount: ${approval.usdc_amount} USDC`)
    console.log(`   Hash: ${approval.approval_hash}`)

    const result = await verifyUSDCApproval(
      approval.approval_hash,
      approval.wallet_address,
      approval.usdc_amount
    )

    if (result.isValid) {
      console.log(`   ✅ VALID - On-chain verification passed`)
      validCount++
    } else {
      console.log(`   ❌ INVALID - ${result.error}`)
      invalidCount++
      invalidApprovals.push({
        id: approval.id,
        property_id: approval.property_id,
        wallet_address: approval.wallet_address,
        approval_hash: approval.approval_hash,
        error: result.error
      })
    }
  }

  console.log(`\n📊 Validation Summary:`)
  console.log(`   ✅ Valid approvals: ${validCount}`)
  console.log(`   ❌ Invalid approvals: ${invalidCount}`)

  if (invalidApprovals.length > 0) {
    console.log(`\n🔧 Marking invalid approvals...`)
    
    for (const invalid of invalidApprovals) {
      const { error: updateError } = await supabase
        .from('payment_authorizations')
        .update({ 
          payment_status: 'invalid_verification_failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', invalid.id)

      if (updateError) {
        console.log(`   ❌ Failed to update approval ${invalid.id}:`, updateError)
      } else {
        console.log(`   ✅ Marked approval ${invalid.id} as invalid`)
      }
    }

    console.log(`\n⚠️  Properties affected by invalid approvals:`)
    const affectedProperties = [...new Set(invalidApprovals.map(a => a.property_id))]
    
    for (const propertyId of affectedProperties) {
      console.log(`   - ${propertyId}`)
      
      // Check if property should be flagged
      const { data: validApprovalsForProperty } = await supabase
        .from('payment_authorizations')
        .select('usdc_amount')
        .eq('property_id', propertyId)
        .eq('payment_status', 'approved')

      const { data: property } = await supabase
        .from('properties')
        .select('funding_goal_usdc, name')
        .eq('id', propertyId)
        .single()

      if (property) {
        const validFunding = validApprovalsForProperty?.reduce((sum, a) => sum + a.usdc_amount, 0) || 0
        const goalMet = validFunding >= property.funding_goal_usdc

        console.log(`     Property: ${property.name}`)
        console.log(`     Valid funding: $${validFunding} / $${property.funding_goal_usdc}`)
        console.log(`     Goal met with valid data: ${goalMet ? 'YES' : 'NO'}`)

        if (!goalMet) {
          await supabase
            .from('properties')
            .update({ status: 'flagged_insufficient_valid_funding' })
            .eq('id', propertyId)
          
          console.log(`     🚨 Property flagged due to insufficient valid funding`)
        }
      }
    }
  }

  console.log(`\n✅ Validation complete!`)
}

// Run the validation
validateAllApprovals().catch(console.error) 