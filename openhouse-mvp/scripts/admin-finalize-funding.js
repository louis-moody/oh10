const { createClient } = require('@supabase/supabase-js');
const hre = require("hardhat");
const { ethers } = hre;

// fix: load environment variables (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// fix: predefined wallet addresses (Cursor Rule 4)
const TREASURY_ADDRESS = "0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819";
const OPERATOR_ADDRESS = "0x88c245fBdbD7e8f75AEE3CCC274d411Cb001d4C2";

// fix: USDC addresses for Base networks (Cursor Rule 4)
const USDC_ADDRESSES = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
};

// fix: USDC ABI for transferFrom operations (Cursor Rule 4)
const USDC_ABI = [
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// fix: PropertyShareToken ABI for minting (Cursor Rule 4)
const PROPERTY_SHARE_TOKEN_ABI = [
  "function mintTo(address to, uint256 amount)",
  "function totalMinted() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function mintingCompleted() view returns (bool)",
  "function completeMinting()",
  "function getFundingProgressBasisPoints() view returns (uint256)"
];

async function main() {
  console.log("🏦 Starting funding finalization process...\n");

  // fix: get network configuration (Cursor Rule 4)
  const network = hre.network.name;
  const usdcAddress = USDC_ADDRESSES[network];
  
  if (!usdcAddress) {
    console.error(`❌ USDC address not configured for network: ${network}`);
    process.exit(1);
  }

  console.log("📊 Network:", network);
  console.log("💰 USDC Address:", usdcAddress);
  console.log("🏛️  Treasury:", TREASURY_ADDRESS);
  console.log("");

  // fix: get signer for transactions (Cursor Rule 4)
  const [signer] = await ethers.getSigners();
  console.log("🔑 Admin Signer:", signer.address);
  console.log("");

  // fix: fetch properties that have reached funding goals (Cursor Rule 4)
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select(`
      id,
      name,
      funding_goal_usdc,
      total_shares,
      price_per_token,
      status,
      token_contract_address
    `)
    .eq('status', 'active')
    .not('token_contract_address', 'is', null);

  if (propertiesError) {
    console.error("❌ Error fetching properties:", propertiesError);
    process.exit(1);
  }

  if (!properties || properties.length === 0) {
    console.log("ℹ️  No active properties with deployed tokens found");
    process.exit(0);
  }

  console.log(`📋 Found ${properties.length} active properties with tokens\n`);

  for (const property of properties) {
    console.log(`🏠 Processing: ${property.name} (${property.id})`);
    console.log(`   Token Contract: ${property.token_contract_address}`);
    console.log(`   Funding Goal: $${property.funding_goal_usdc.toLocaleString()}`);

    try {
      // fix: fetch approved reservations for this property (Cursor Rule 4)
      const { data: reservations, error: reservationsError } = await supabase
        .from('payment_authorizations')
        .select('*')
        .eq('property_id', property.id)
        .eq('payment_status', 'approved')
        .order('created_at', { ascending: true });

      if (reservationsError) {
        console.error(`   ❌ Error fetching reservations: ${reservationsError.message}`);
        continue;
      }

      if (!reservations || reservations.length === 0) {
        console.log("   ℹ️  No approved reservations found");
        continue;
      }

      // fix: calculate total funding (Cursor Rule 4)
      const totalFunding = reservations.reduce((sum, res) => sum + parseFloat(res.usdc_amount), 0);
      const totalShares = reservations.reduce((sum, res) => sum + res.token_amount, 0);
      const fundingProgress = (totalFunding / property.funding_goal_usdc) * 100;

      console.log(`   💰 Total Reserved: $${totalFunding.toLocaleString()} (${fundingProgress.toFixed(1)}%)`);
      console.log(`   🎯 Shares Reserved: ${totalShares.toLocaleString()}`);

      // fix: check if funding goal is reached (Cursor Rule 4)
      if (totalFunding < property.funding_goal_usdc) {
        console.log("   ⏳ Funding goal not yet reached");
        continue;
      }

      console.log("   ✅ Funding goal reached! Processing payments...");

      // fix: get contract instances (Cursor Rule 4)
      const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, signer);
      const tokenContract = new ethers.Contract(property.token_contract_address, PROPERTY_SHARE_TOKEN_ABI, signer);

      let successfulTransfers = 0;
      let totalCollected = 0;

      // fix: process each reservation (Cursor Rule 4)
      for (const reservation of reservations) {
        if (reservation.payment_status !== 'approved') {
          continue;
        }

        console.log(`     👤 Processing ${reservation.wallet_address}...`);
        console.log(`        Amount: $${reservation.usdc_amount} for ${reservation.token_amount} shares`);

        try {
          // fix: check user's USDC allowance (Cursor Rule 6)
          const allowance = await usdcContract.allowance(reservation.wallet_address, TREASURY_ADDRESS);
          const requiredAmount = ethers.parseUnits(reservation.usdc_amount.toString(), 6);

          if (allowance < requiredAmount) {
            console.log(`        ⚠️  Insufficient allowance: ${ethers.formatUnits(allowance, 6)} USDC`);
            continue;
          }

          // fix: transfer USDC from user to treasury (Cursor Rule 4)
          console.log(`        💸 Collecting ${reservation.usdc_amount} USDC...`);
          const transferTx = await usdcContract.transferFrom(
            reservation.wallet_address,
            TREASURY_ADDRESS,
            requiredAmount
          );
          
          const transferReceipt = await transferTx.wait();
          console.log(`        ✅ USDC collected: ${transferReceipt.hash}`);

          // fix: mint tokens to user (Cursor Rule 4)
          console.log(`        🪙 Minting ${reservation.token_amount} tokens...`);
          const mintTx = await tokenContract.mintTo(
            reservation.wallet_address,
            reservation.token_amount
          );
          
          const mintReceipt = await mintTx.wait();
          console.log(`        ✅ Tokens minted: ${mintReceipt.hash}`);

          // fix: update reservation status in database (Cursor Rule 4)
          const { error: updateError } = await supabase
            .from('payment_authorizations')
            .update({
              payment_status: 'transferred',
              transfer_hash: transferReceipt.hash,
              transfer_timestamp: new Date().toISOString(),
              tokens_minted: true,
              mint_hash: mintReceipt.hash,
              mint_timestamp: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', reservation.id);

          if (updateError) {
            console.log(`        ⚠️  Database update failed: ${updateError.message}`);
          } else {
            console.log(`        ✅ Database updated`);
          }

          successfulTransfers++;
          totalCollected += parseFloat(reservation.usdc_amount);

        } catch (error) {
          console.error(`        ❌ Failed to process reservation: ${error.message}`);
          
          // fix: mark reservation as failed (Cursor Rule 4)
          await supabase
            .from('payment_authorizations')
            .update({
              payment_status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', reservation.id);
        }
      }

      console.log(`   📊 Summary:`);
      console.log(`      Successful transfers: ${successfulTransfers}/${reservations.length}`);
      console.log(`      Total collected: $${totalCollected.toLocaleString()}`);

      // fix: check if all tokens have been minted (Cursor Rule 4)
      const totalMinted = await tokenContract.totalMinted();
      const totalTokenShares = await tokenContract.totalShares();
      const mintingCompleted = await tokenContract.mintingCompleted();

      console.log(`      Tokens minted: ${totalMinted}/${totalTokenShares}`);
      
      if (!mintingCompleted && totalMinted >= totalTokenShares * BigInt(95) / BigInt(100)) {
        // fix: complete minting if 95% or more shares are sold (Cursor Rule 4)
        console.log(`   🔒 Completing minting process...`);
        const completeTx = await tokenContract.completeMinting();
        await completeTx.wait();
        console.log(`   ✅ Minting completed`);

        // fix: update property status to funded (Cursor Rule 4)
        const { error: statusError } = await supabase
          .from('properties')
          .update({
            status: 'funded',
            updated_at: new Date().toISOString()
          })
          .eq('id', property.id);

        if (statusError) {
          console.log(`   ⚠️  Failed to update property status: ${statusError.message}`);
        } else {
          console.log(`   ✅ Property status updated to 'funded'`);
        }
      }

    } catch (error) {
      console.error(`   ❌ Error processing property: ${error.message}`);
    }

    console.log(""); // Empty line between properties
  }

  console.log("🎉 Funding finalization process completed!");
}

// fix: handle script execution (Cursor Rule 4)
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }); 