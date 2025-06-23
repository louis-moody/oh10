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

// fix: contract ABIs for verification (Cursor Rule 4)
const PROPERTY_TOKEN_ABI = [
  "function propertyId() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function mintingCompleted() view returns (bool)",
  "function pricePerToken() view returns (uint256)",
  "function fundingGoalUsdc() view returns (uint256)"
];

const YIELD_DISTRIBUTOR_ABI = [
  "function propertyId() view returns (uint256)",
  "function propertyToken() view returns (address)",
  "function usdcToken() view returns (address)",
  "function rentalWallet() view returns (address)",
  "function currentDistributionRound() view returns (uint256)",
  "function totalDistributedUsdc() view returns (uint256)"
];

const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function main() {
  console.log("🔍 Comprehensive Contract Verification...\n");

  try {
    // fix: connect to Base Sepolia (Cursor Rule 4)
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    // fix: get property data from Supabase (Cursor Rule 4)
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single();

    if (propertyError || !property) {
      console.error("❌ Failed to fetch property:", propertyError);
      return;
    }

    // fix: get token details from Supabase (Cursor Rule 4)
    const { data: tokenDetails, error: tokenError } = await supabase
      .from('property_token_details')
      .select('*')
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single();

    if (tokenError || !tokenDetails) {
      console.error("❌ Failed to fetch token details:", tokenError);
      return;
    }

    console.log("📋 Supabase Data:");
    console.log("   Property ID:", property.id);
    console.log("   Property Name:", property.name);
    console.log("   Property Status:", property.status);
    console.log("   PropertyShareToken:", tokenDetails.contract_address);
    console.log("   YieldDistributor:", tokenDetails.yield_distributor_address);
    console.log("   Rental Wallet:", tokenDetails.rental_wallet_address);
    console.log("");

    // fix: verify PropertyShareToken is live (Cursor Rule 4)
    console.log("🔗 Verifying PropertyShareToken...");
    if (!tokenDetails.contract_address) {
      console.error("❌ No PropertyShareToken address in Supabase!");
      return;
    }

    try {
      const propertyTokenContract = new ethers.Contract(
        tokenDetails.contract_address, 
        PROPERTY_TOKEN_ABI, 
        provider
      );

      const [propertyId, totalSupply, mintingCompleted, pricePerToken, fundingGoal] = await Promise.all([
        propertyTokenContract.propertyId(),
        propertyTokenContract.totalSupply(),
        propertyTokenContract.mintingCompleted(),
        propertyTokenContract.pricePerToken(),
        propertyTokenContract.fundingGoalUsdc()
      ]);

      console.log("✅ PropertyShareToken is live!");
      console.log("   Property ID:", propertyId.toString());
      console.log("   Total Supply:", totalSupply.toString(), "tokens");
      console.log("   Minting Completed:", mintingCompleted);
      console.log("   Price per Token:", ethers.formatUnits(pricePerToken, 6), "USDC");
      console.log("   Funding Goal:", ethers.formatUnits(fundingGoal, 6), "USDC");
      console.log("");

    } catch (error) {
      console.error("❌ PropertyShareToken is NOT live or accessible!");
      console.error("   Error:", error.message);
      return;
    }

    // fix: verify YieldDistributor is live (Cursor Rule 4)
    console.log("🔗 Verifying YieldDistributor...");
    if (!tokenDetails.yield_distributor_address) {
      console.error("❌ No YieldDistributor address in Supabase!");
      return;
    }

    try {
      const yieldDistributorContract = new ethers.Contract(
        tokenDetails.yield_distributor_address,
        YIELD_DISTRIBUTOR_ABI,
        provider
      );

      const [ydPropertyId, propertyTokenAddr, usdcTokenAddr, rentalWalletAddr, currentRound, totalDistributed] = await Promise.all([
        yieldDistributorContract.propertyId(),
        yieldDistributorContract.propertyToken(),
        yieldDistributorContract.usdcToken(),
        yieldDistributorContract.rentalWallet(),
        yieldDistributorContract.currentDistributionRound(),
        yieldDistributorContract.totalDistributedUsdc()
      ]);

      console.log("✅ YieldDistributor is live!");
      console.log("   Property ID:", ydPropertyId.toString());
      console.log("   Property Token:", propertyTokenAddr);
      console.log("   USDC Token:", usdcTokenAddr);
      console.log("   Rental Wallet:", rentalWalletAddr);
      console.log("   Current Round:", currentRound.toString());
      console.log("   Total Distributed:", ethers.formatUnits(totalDistributed, 6), "USDC");
      console.log("");

      // fix: verify contract addresses match (Cursor Rule 6)
      console.log("🔄 Verifying address consistency...");
      let hasErrors = false;

      if (propertyTokenAddr.toLowerCase() !== tokenDetails.contract_address.toLowerCase()) {
        console.error("❌ MISMATCH: YieldDistributor.propertyToken != Supabase.contract_address");
        console.error("   YieldDistributor:", propertyTokenAddr);
        console.error("   Supabase:", tokenDetails.contract_address);
        hasErrors = true;
      }

      if (rentalWalletAddr.toLowerCase() !== tokenDetails.rental_wallet_address.toLowerCase()) {
        console.error("❌ MISMATCH: YieldDistributor.rentalWallet != Supabase.rental_wallet_address");
        console.error("   YieldDistributor:", rentalWalletAddr);
        console.error("   Supabase:", tokenDetails.rental_wallet_address);
        hasErrors = true;
      }

      if (usdcTokenAddr.toLowerCase() !== usdcAddress.toLowerCase()) {
        console.error("❌ MISMATCH: YieldDistributor.usdcToken != Expected USDC address");
        console.error("   YieldDistributor:", usdcTokenAddr);
        console.error("   Expected:", usdcAddress);
        hasErrors = true;
      }

      if (!hasErrors) {
        console.log("✅ All addresses match between contracts and Supabase!");
      }
      console.log("");

    } catch (error) {
      console.error("❌ YieldDistributor is NOT live or accessible!");
      console.error("   Error:", error.message);
      return;
    }

    // fix: verify USDC approval status (Cursor Rule 4)
    console.log("💰 Verifying USDC setup...");
    const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, provider);

    const [rentalBalance, allowance] = await Promise.all([
      usdcContract.balanceOf(tokenDetails.rental_wallet_address),
      usdcContract.allowance(tokenDetails.rental_wallet_address, tokenDetails.yield_distributor_address)
    ]);

    console.log("   Rental Wallet Balance:", ethers.formatUnits(rentalBalance, 6), "USDC");
    console.log("   Allowance to YieldDistributor:", ethers.formatUnits(allowance, 6), "USDC");

    const requestedAmount = ethers.parseUnits("10", 6); // 10 USDC test
    if (rentalBalance < requestedAmount) {
      console.error("❌ Insufficient USDC in rental wallet for 10 USDC test");
    } else if (allowance < requestedAmount) {
      console.error("❌ Insufficient allowance for 10 USDC test");
    } else {
      console.log("✅ USDC setup looks good for 10 USDC distribution!");
    }
    console.log("");

    // fix: test contract function calls (Cursor Rule 4)
    console.log("🧪 Testing contract readability...");
    try {
      // Test a simple read function to ensure contract is accessible
      const testCall = await provider.getCode(tokenDetails.yield_distributor_address);
      if (testCall === '0x') {
        console.error("❌ YieldDistributor address has no contract code!");
      } else {
        console.log("✅ YieldDistributor has contract code");
      }

      const testCall2 = await provider.getCode(tokenDetails.contract_address);
      if (testCall2 === '0x') {
        console.error("❌ PropertyShareToken address has no contract code!");
      } else {
        console.log("✅ PropertyShareToken has contract code");
      }

    } catch (error) {
      console.error("❌ Error testing contract accessibility:", error.message);
    }

    console.log("\n🎉 Verification Complete!");
    console.log("📝 Summary: If all items above show ✅, the contracts should work properly");

  } catch (error) {
    console.error("❌ Error during verification:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 