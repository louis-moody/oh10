const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('hardhat');

// fix: load environment variables for verification (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// fix: USDC contract ABI for checking allowances (Cursor Rule 4)
const USDC_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

async function main() {
  console.log("🔍 Checking YieldDistributor setup...\n");

  try {
    // fix: get property token details from Supabase (Cursor Rule 4)
    const { data: tokenDetails, error } = await supabase
      .from('property_token_details')
      .select('*')
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single();

    if (error || !tokenDetails) {
      console.error("❌ Failed to fetch token details:", error);
      return;
    }

    console.log("📋 Property Details:");
    console.log("   YieldDistributor:", tokenDetails.yield_distributor_address);
    console.log("   Rental Wallet:", tokenDetails.rental_wallet_address);
    console.log("   PropertyShareToken:", tokenDetails.contract_address);
    console.log("");

    // fix: connect to Base Sepolia and check contract state (Cursor Rule 4)
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, provider);

    // fix: check rental wallet USDC balance and allowance (Cursor Rule 4)
    const rentalWalletBalance = await usdcContract.balanceOf(tokenDetails.rental_wallet_address);
    const allowance = await usdcContract.allowance(
      tokenDetails.rental_wallet_address,
      tokenDetails.yield_distributor_address
    );

    console.log("💰 Rental Wallet Status:");
    console.log("   USDC Balance:", ethers.formatUnits(rentalWalletBalance, 6), "USDC");
    console.log("   Allowance to YieldDistributor:", ethers.formatUnits(allowance, 6), "USDC");
    console.log("");

    // fix: check if allowance is sufficient for the transaction (Cursor Rule 4)
    const requestedAmount = ethers.parseUnits("5", 6); // 5 USDC
    
    if (rentalWalletBalance < requestedAmount) {
      console.log("❌ ISSUE: Rental wallet doesn't have enough USDC!");
      console.log("   Need:", ethers.formatUnits(requestedAmount, 6), "USDC");
      console.log("   Have:", ethers.formatUnits(rentalWalletBalance, 6), "USDC");
    } else {
      console.log("✅ Rental wallet has sufficient USDC");
    }

    if (allowance < requestedAmount) {
      console.log("❌ ISSUE: Rental wallet hasn't approved YieldDistributor!");
      console.log("   Need allowance:", ethers.formatUnits(requestedAmount, 6), "USDC");
      console.log("   Current allowance:", ethers.formatUnits(allowance, 6), "USDC");
      console.log("\n🔧 SOLUTION:");
      console.log("   The rental wallet needs to approve the YieldDistributor contract:");
      console.log(`   Contract: ${tokenDetails.yield_distributor_address}`);
      console.log("   This requires the rental wallet owner to sign an approval transaction");
    } else {
      console.log("✅ Rental wallet has approved sufficient USDC");
    }

  } catch (error) {
    console.error("❌ Error checking setup:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 