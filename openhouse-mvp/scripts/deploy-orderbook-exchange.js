const { createClient } = require('@supabase/supabase-js');
const hre = require("hardhat");

// fix: get wallet addresses from environment variables (Cursor Rule 4)
const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
const OPERATOR_ADDRESS = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS;
const FALLBACK_ADDRESS = process.env.NEXT_PUBLIC_FALLBACK_ADDRESS;

// fix: validate required environment variables (Cursor Rule 6)
const requiredAddresses = {
  NEXT_PUBLIC_DEPLOYER_ADDRESS: DEPLOYER_ADDRESS,
  NEXT_PUBLIC_TREASURY_ADDRESS: TREASURY_ADDRESS,
  NEXT_PUBLIC_OPERATOR_ADDRESS: OPERATOR_ADDRESS,
  NEXT_PUBLIC_FALLBACK_ADDRESS: FALLBACK_ADDRESS
};

for (const [envVar, value] of Object.entries(requiredAddresses)) {
  if (!value) {
    console.error(`❌ ${envVar} environment variable not set`);
    process.exit(1);
  }
}

// fix: USDC token addresses for Base network (Cursor Rule 4)
const USDC_ADDRESSES = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // Base Mainnet USDC
};

async function main() {
  // fix: validate environment variables (Cursor Rule 6)
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // fix: initialize Supabase client (Cursor Rule 4)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // fix: get network information (Cursor Rule 4)
  const network = hre.network.name;
  console.log(`\n🚀 Deploying OrderBookExchange to ${network}...`);

  // fix: get USDC address for current network (Cursor Rule 4)
  const usdcAddress = USDC_ADDRESSES[network];
  if (!usdcAddress) {
    throw new Error(`USDC address not configured for network: ${network}`);
  }
  console.log(`📍 Using USDC address: ${usdcAddress}`);

  // fix: fetch property data from Supabase (Cursor Rule 4)
  console.log("\n📊 Fetching property data from Supabase...");
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('*')
    .eq('status', 'funding_complete'); // Only deploy for completed funding

  if (propertiesError) {
    throw new Error(`Failed to fetch properties: ${propertiesError.message}`);
  }

  if (!properties || properties.length === 0) {
    console.log("⚠️  No properties with completed funding found");
    return;
  }

  console.log(`✅ Found ${properties.length} properties ready for OrderBook deployment`);

  // fix: get deployed PropertyShareToken addresses (Cursor Rule 4)
  const { data: tokenDetails, error: tokenError } = await supabase
    .from('property_token_details')
    .select('*')
    .in('property_id', properties.map(p => p.id));

  if (tokenError) {
    throw new Error(`Failed to fetch token details: ${tokenError.message}`);
  }

  if (!tokenDetails || tokenDetails.length === 0) {
    throw new Error("No PropertyShareToken contracts found. Deploy tokens first.");
  }

  console.log(`✅ Found ${tokenDetails.length} deployed PropertyShareTokens`);

  // fix: deploy OrderBookExchange for each property (Cursor Rule 4)
  const deployments = [];
  
  for (const property of properties) {
    console.log(`\n🏠 Processing property: ${property.name} (ID: ${property.id})`);
    
    // fix: find corresponding token contract (Cursor Rule 4)
    const tokenDetail = tokenDetails.find(td => td.property_id === property.id);
    if (!tokenDetail || !tokenDetail.contract_address) {
      console.log(`⚠️  No token contract found for property ${property.id}, skipping...`);
      continue;
    }

    // fix: check if OrderBook already deployed (Cursor Rule 4)
    const { data: existingOrderBook } = await supabase
      .from('property_token_details')
      .select('orderbook_contract_address')
      .eq('property_id', property.id)
      .single();

    if (existingOrderBook?.orderbook_contract_address) {
      console.log(`✅ OrderBook already deployed at: ${existingOrderBook.orderbook_contract_address}`);
      continue;
    }

    try {
      // fix: deploy OrderBookExchange with constructor parameters from Supabase (Cursor Rule 4)
      console.log(`🔧 Deploying OrderBookExchange for property ${property.id}...`);
      
      const OrderBookExchange = await hre.ethers.getContractFactory("OrderBookExchange");
      const orderBookExchange = await OrderBookExchange.deploy(
        property.id,                    // _propertyId
        tokenDetail.contract_address,   // _propertyTokenAddress
        usdcAddress,                   // _usdcTokenAddress
        TREASURY_ADDRESS,              // _treasury
        OPERATOR_ADDRESS,              // _operator
        50                            // _protocolFeeBasisPoints (0.5%)
      );

      await orderBookExchange.waitForDeployment();
      const orderBookAddress = await orderBookExchange.getAddress();

      console.log(`✅ OrderBookExchange deployed at: ${orderBookAddress}`);

      // fix: update Supabase with OrderBook contract address (Cursor Rule 4)
      const { error: updateError } = await supabase
        .from('property_token_details')
        .update({
          orderbook_contract_address: orderBookAddress,
          orderbook_deployed_at: new Date().toISOString(),
          orderbook_deployer_address: DEPLOYER_ADDRESS,
          orderbook_treasury_address: TREASURY_ADDRESS,
          orderbook_operator_address: OPERATOR_ADDRESS,
          protocol_fee_basis_points: 50
        })
        .eq('property_id', property.id);

      if (updateError) {
        console.error(`❌ Failed to update Supabase: ${updateError.message}`);
        throw updateError;
      }

      // fix: verify contract deployment (Cursor Rule 6)
      const deployedCode = await hre.ethers.provider.getCode(orderBookAddress);
      if (deployedCode === '0x') {
        throw new Error('Contract deployment failed - no code at address');
      }

      deployments.push({
        propertyId: property.id,
        propertyName: property.name,
        tokenAddress: tokenDetail.contract_address,
        orderBookAddress: orderBookAddress,
        network: network
      });

      console.log(`✅ Property ${property.id} OrderBook deployment complete`);
      
    } catch (error) {
      console.error(`❌ Failed to deploy OrderBook for property ${property.id}:`, error.message);
      throw error;
    }
  }

  // fix: summary of all deployments (Cursor Rule 4)
  console.log("\n📋 Deployment Summary:");
  console.log("=" .repeat(80));
  
  if (deployments.length === 0) {
    console.log("⚠️  No new OrderBook contracts deployed");
  } else {
    deployments.forEach((deployment, index) => {
      console.log(`${index + 1}. ${deployment.propertyName} (ID: ${deployment.propertyId})`);
      console.log(`   Token:     ${deployment.tokenAddress}`);
      console.log(`   OrderBook: ${deployment.orderBookAddress}`);
      console.log(`   Network:   ${deployment.network}`);
      console.log("");
    });
  }

  console.log("🎉 OrderBookExchange deployment process completed!");
  console.log("\n📝 Next steps:");
  console.log("1. Verify contracts on block explorer");
  console.log("2. Test order creation and execution");
  console.log("3. Configure frontend integration");
  console.log("4. Set up fee collection automation");
}

// fix: handle deployment errors gracefully (Cursor Rule 6)
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  }); 