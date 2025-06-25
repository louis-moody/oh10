const hre = require("hardhat");
const { createClient } = require('@supabase/supabase-js');

const { ethers } = hre;

// fix: load environment variables for Supabase connection (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// fix: predefined wallet addresses for role-based access control (Cursor Rule 3)
const WALLET_ADDRESSES = {
  DEPLOYER: "0x71c835E77B2Cc377fcfd9a37685Fea81a334cb81",
  TREASURY: "0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819", 
  OPERATOR: "0x88c245fBdbD7e8f75AEE3CCC274d411Cb001d4C2",
  FALLBACK: "0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553"
};

// fix: Base network USDC addresses (Cursor Rule 4)
const USDC_ADDRESSES = {
  sepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  mainnet: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  // Base Mainnet USDC
};

async function main() {
  console.log("🚀 Deploying YieldDistributor contracts...\n");

  // fix: get network configuration (Cursor Rule 4)
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkName = chainId === 84532 ? "sepolia" : "mainnet"; // Base Sepolia = 84532, Base Mainnet = 8453
  const usdcAddress = USDC_ADDRESSES[networkName];
  
  console.log("📊 Network:", networkName);
  console.log("💰 USDC Address:", usdcAddress);
  console.log("🏛️  Treasury:", WALLET_ADDRESSES.TREASURY);
  console.log("⚙️  Operator:", WALLET_ADDRESSES.OPERATOR);
  console.log("");

  // fix: check if deploying for a specific property or all properties (Cursor Rule 4)
  const targetPropertyId = process.env.PROPERTY_ID;
  const targetPropertyTokenAddress = process.env.PROPERTY_TOKEN_ADDRESS;
  const targetRentalWalletAddress = process.env.RENTAL_WALLET_ADDRESS;

  let properties = [];

  if (targetPropertyId && targetPropertyTokenAddress && targetRentalWalletAddress) {
    // Single property deployment mode (called from deploy-token API)
    console.log("🎯 Single property deployment mode");
    console.log(`   Property ID: ${targetPropertyId}`);
    console.log(`   Token Address: ${targetPropertyTokenAddress}`);
    console.log(`   Rental Wallet: ${targetRentalWalletAddress}`);
    
    // Create a property object for single deployment
    properties = [{
      property_id: targetPropertyId,
      contract_address: targetPropertyTokenAddress,
      rental_wallet_address: targetRentalWalletAddress,
      token_name: `Property_${targetPropertyId.slice(0, 8)}`,
      token_symbol: `PROP${targetPropertyId.slice(0, 4)}`
    }];
  } else {
    // Batch deployment mode (standalone script)
    console.log("📦 Batch deployment mode - deploying for all properties");
    
    const { data: fetchedProperties, error } = await supabase
      .from('property_token_details')
      .select(`
        property_id,
        contract_address,
        rental_wallet_address,
        token_name,
        token_symbol
      `)
      .not('contract_address', 'is', null)
      .not('rental_wallet_address', 'is', null)
      .is('yield_distributor_address', null); // Only deploy for properties without YieldDistributor

    if (error) {
      console.error("❌ Error fetching properties from Supabase:", error);
      process.exit(1);
    }

    if (!fetchedProperties || fetchedProperties.length === 0) {
      console.log("⚠️  No properties need YieldDistributor deployment");
      console.log("   All properties either have YieldDistributor deployed or lack required contracts");
      process.exit(0);
    }

    properties = fetchedProperties;
  }

  console.log(`📋 Deploying YieldDistributor for ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}:\n`);

  // fix: deploy YieldDistributor for each property with PropertyShareToken (Cursor Rule 4)
  for (const property of properties) {
    console.log(`🏠 Deploying YieldDistributor for Property ID: ${property.property_id}`);
    console.log(`   Property ID: ${property.property_id}`);
    console.log(`   Token: ${property.token_name} (${property.token_symbol})`);
    console.log(`   PropertyShareToken: ${property.contract_address}`);
    console.log(`   Rental Wallet: ${property.rental_wallet_address}`);

    try {
      // fix: deploy YieldDistributor with constructor arguments from Supabase (Cursor Rule 4)
      // Convert UUID to numeric hash for propertyId (same as PropertyShareToken deployment)
      const propertyIdHash = property.property_id.replace(/-/g, '').split('').reduce((acc, char) => {
        return acc + char.charCodeAt(0)
      }, 0)
      
      const YieldDistributorFactory = await ethers.getContractFactory("YieldDistributor");
      
      const yieldDistributor = await YieldDistributorFactory.deploy(
        propertyIdHash, // Property ID as numeric hash
        property.contract_address, // PropertyShareToken address
        usdcAddress, // USDC token address for Base network
        WALLET_ADDRESSES.TREASURY, // Treasury wallet
        WALLET_ADDRESSES.OPERATOR, // Operator wallet
        property.rental_wallet_address // Rental wallet address from Supabase
      );

      await yieldDistributor.waitForDeployment();
      const deployedAddress = await yieldDistributor.getAddress();
      const deploymentHash = yieldDistributor.deploymentTransaction()?.hash;

      console.log(`   ✅ YieldDistributor deployed: ${deployedAddress}`);
      if (deploymentHash) {
        console.log(`   📝 Deployment hash: ${deploymentHash}`);
      }

      // fix: store YieldDistributor contract address in Supabase (Cursor Rule 4)
      const { error: updateError } = await supabase
        .from('property_token_details')
        .update({
          yield_distributor_address: deployedAddress,
          yield_distributor_deployed_at: new Date().toISOString()
        })
        .eq('property_id', property.property_id);

      if (updateError) {
        console.error(`   ❌ Error updating Supabase:`, updateError);
      } else {
        console.log(`   📝 Updated Supabase with YieldDistributor address`);
      }

      console.log("");

    } catch (deployError) {
      console.error(`   ❌ Deployment failed:`, deployError);
      console.log("");
      continue;
    }
  }

  console.log("🎉 YieldDistributor deployment complete!");
  console.log("\n📋 Next steps:");
  console.log("   1. Verify contracts on BaseScan");
  console.log("   2. Test yield deposit and distribution functions");
  console.log("   3. Update frontend to interact with YieldDistributor contracts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Deployment failed:", error);
    process.exit(1);
  }); 