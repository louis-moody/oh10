const { createClient } = require('@supabase/supabase-js');
const hre = require("hardhat");
const { ethers } = require("hardhat");

// fix: get wallet addresses from environment variables (Cursor Rule 4)
const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
const OPERATOR_ADDRESS = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS;

// fix: validate required environment variables (Cursor Rule 6)
const requiredAddresses = {
  NEXT_PUBLIC_DEPLOYER_ADDRESS: DEPLOYER_ADDRESS,
  NEXT_PUBLIC_TREASURY_ADDRESS: TREASURY_ADDRESS,
  NEXT_PUBLIC_OPERATOR_ADDRESS: OPERATOR_ADDRESS
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

// fix: Supabase configuration (Cursor Rule 4)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('🚀 Deploying OpenHouseRouter...');
  
  // fix: get network information (Cursor Rule 4)
  const network = hre.network.name;
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  const chainIdBigInt = (await provider.getNetwork()).chainId;
  const chainId = chainIdBigInt.toString();
  
  console.log(`📡 Network: ${network} (Chain ID: ${chainId})`);
  
  // fix: determine USDC address based on network (Cursor Rule 4)
  let usdcAddress;
  if (network === 'base' || chainId === '8453') {
    usdcAddress = USDC_ADDRESSES.base;
  } else if (network === 'base-sepolia' || chainId === '84532') {
    usdcAddress = USDC_ADDRESSES['base-sepolia'];
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
  
  // fix: deployment parameters (Cursor Rule 4)
  const routerFeeBasisPoints = process.env.ROUTER_FEE_BASIS_POINTS || '10'; // 0.1% default
  
  console.log('📋 Deployment Parameters:');
  console.log(`   USDC Address: ${usdcAddress}`);
  console.log(`   Treasury Address: ${TREASURY_ADDRESS}`);
  console.log(`   Operator Address: ${OPERATOR_ADDRESS}`);
  console.log(`   Router Fee: ${routerFeeBasisPoints} basis points (${routerFeeBasisPoints/100}%)`);
  
  // fix: get contract factory (Cursor Rule 4)
  const OpenHouseRouter = await ethers.getContractFactory("OpenHouseRouter");
  
  // fix: deploy contract (Cursor Rule 4)
  console.log('⏳ Deploying contract...');
  const router = await OpenHouseRouter.deploy(
    usdcAddress,
    TREASURY_ADDRESS,
    OPERATOR_ADDRESS,
    routerFeeBasisPoints
  );
  
  // fix: wait for deployment confirmation (Cursor Rule 4)
  await router.waitForDeployment();
  
  const contractAddress = await router.getAddress();
  const deploymentHash = router.deploymentTransaction().hash;
  
  console.log(`✅ OpenHouseRouter deployed successfully!`);
  console.log(`📍 Contract Address: ${contractAddress}`);
  console.log(`🔗 Deployment Hash: ${deploymentHash}`);
  
  // fix: register all existing properties with the router (Cursor Rule 4)
  console.log('🔄 Registering existing properties...');
  
  // fix: fetch all properties with deployed orderbooks (Cursor Rule 4)
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id, name, token_contract_address, orderbook_contract_address')
    .not('token_contract_address', 'is', null)
    .not('orderbook_contract_address', 'is', null);
  
  if (propertiesError) {
    console.warn('⚠️ Failed to fetch properties:', propertiesError.message);
  } else if (properties && properties.length > 0) {
    console.log(`📊 Found ${properties.length} properties to register`);
    
    let registeredCount = 0;
    for (const property of properties) {
      try {
        console.log(`   Registering property ${property.id}: ${property.name}`);
        
        // fix: register property with router (Cursor Rule 4)
        const tx = await router.registerProperty(
          property.id,
          property.orderbook_contract_address,
          property.token_contract_address
        );
        
        await tx.wait();
        registeredCount++;
        
        console.log(`   ✅ Registered: ${property.name}`);
      } catch (error) {
        console.error(`   ❌ Failed to register ${property.name}:`, error.message);
      }
    }
    
    console.log(`✅ Successfully registered ${registeredCount}/${properties.length} properties`);
  }
  
  // fix: save router address to database (Cursor Rule 4)
  console.log('💾 Saving router address to database...');
  
  const { error: insertError } = await supabase
    .from('openhouse_router')
    .upsert({
      chain_id: parseInt(chainId),
      network_name: network,
      contract_address: contractAddress,
      deployment_hash: deploymentHash,
      usdc_address: usdcAddress,
      treasury_address: TREASURY_ADDRESS,
      operator_address: OPERATOR_ADDRESS,
      router_fee_basis_points: parseInt(routerFeeBasisPoints),
      deployed_at: new Date().toISOString(),
      is_active: true
    }, {
      onConflict: 'chain_id'
    });
  
  if (insertError) {
    console.warn('⚠️ Failed to save router to database:', insertError.message);
  } else {
    console.log('✅ Router address saved to database');
  }
  
  // fix: verify deployment (Cursor Rule 4)
  console.log('🔍 Verifying deployment...');
  
  try {
    const routerFeeBasisPoints = await router.routerFeeBasisPoints();
    const treasuryAddress = await router.treasury();
    const operatorAddress = await router.operator();
    const usdcTokenAddress = await router.usdcToken();
    
    console.log('📋 Contract Verification:');
    console.log(`   Router Fee: ${routerFeeBasisPoints} basis points`);
    console.log(`   Treasury: ${treasuryAddress}`);
    console.log(`   Operator: ${operatorAddress}`);
    console.log(`   USDC Token: ${usdcTokenAddress}`);
    
    console.log('✅ Contract verification successful!');
  } catch (error) {
    console.error('❌ Contract verification failed:', error.message);
  }
  
  console.log('\n🎉 OpenHouseRouter deployment completed successfully!');
  console.log('\n📋 Next Steps:');
  console.log('1. Update frontend to use router for all trades');
  console.log('2. Deploy market data keeper for price updates');
  console.log('3. Test routing functionality with small trades');
  console.log('4. Monitor router fees and performance');
}

// fix: handle deployment errors gracefully (Cursor Rule 6)
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ OpenHouseRouter deployment failed:', error);
    process.exit(1);
  }); 