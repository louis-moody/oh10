const hre = require("hardhat");
const { ethers } = hre;
const { createClient } = require('@supabase/supabase-js');

// Environment setup
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Contract details
const LONDON_TOKEN_CONTRACT = "0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

async function deployOrderbookForLondon() {
  console.log('🚀 Deploying OrderBookExchange for London Flat...');
  console.log('Token Contract:', LONDON_TOKEN_CONTRACT);
  console.log('USDC Contract:', USDC_ADDRESS);
  console.log('');

  try {
    // Get London Flat property details
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('name', 'London Flat')
      .single();

    if (propertyError) {
      console.error('❌ Error fetching property:', propertyError.message);
      return;
    }

    console.log('🏠 Property:', property.name);
    console.log('📊 Property ID:', property.id);
    console.log('');

    // Get environment variables
    const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
    const operatorAddress = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS;

    if (!treasuryAddress || !operatorAddress) {
      console.log('❌ Missing treasury or operator address in environment');
      return;
    }

    console.log('🏛️ Treasury:', treasuryAddress);
    console.log('🔑 Operator:', operatorAddress);
    console.log('');

    // Deploy OrderBookExchange contract
    console.log('🚀 Deploying OrderBookExchange contract...');
    
    const OrderBookExchange = await ethers.getContractFactory("OrderBookExchange");
    
    // Convert property ID to numeric for contract
    const propertyIdHash = ethers.keccak256(ethers.toUtf8Bytes(property.id));
    const propertyIdNumeric = BigInt(propertyIdHash) % (BigInt(2) ** BigInt(256));
    
    const orderbook = await OrderBookExchange.deploy(
      propertyIdNumeric,              // _propertyId (converted to uint256)
      LONDON_TOKEN_CONTRACT,          // _propertyTokenAddress
      USDC_ADDRESS,                   // _usdcTokenAddress
      treasuryAddress,                // _treasury
      operatorAddress,                // _operator
      50                              // _protocolFeeBasisPoints (0.5%)
    );

    await orderbook.waitForDeployment();
    const orderbookAddress = await orderbook.getAddress();
    
    console.log('✅ OrderBookExchange deployed:', orderbookAddress);
    console.log('');

    // Update property with orderbook contract address
    console.log('📋 Updating property with orderbook address...');
    const { error: updateError } = await supabase
      .from('properties')
      .update({
        orderbook_contract_address: orderbookAddress
      })
      .eq('id', property.id);

    if (updateError) {
      console.log(`   ❌ Failed to update property: ${updateError.message}`);
    } else {
      console.log('   ✅ Property updated successfully');
    }

    // Verify the update
    console.log('');
    console.log('🔍 Verifying deployment...');
    
    const { data: updatedProperty } = await supabase
      .from('properties')
      .select('orderbook_contract_address, token_contract_address, status')
      .eq('id', property.id)
      .single();

    console.log('✅ Updated Property:');
    console.log('   Token Contract:', updatedProperty?.token_contract_address);
    console.log('   Orderbook Contract:', updatedProperty?.orderbook_contract_address);
    console.log('   Status:', updatedProperty?.status);

    // Test orderbook contract functions
    console.log('');
    console.log('🧪 Testing orderbook contract...');
    
    const [propertyId, tokenAddress, usdcAddress, treasury, operator, feeBasisPoints] = await Promise.all([
      orderbook.propertyId(),
      orderbook.propertyToken(),
      orderbook.usdcToken(),
      orderbook.treasury(),
      orderbook.operator(),
      orderbook.protocolFeeBasisPoints()
    ]);

    console.log('   Property ID:', propertyId.toString());
    console.log('   Token Address:', tokenAddress);
    console.log('   USDC Address:', usdcAddress);
    console.log('   Treasury:', treasury);
    console.log('   Operator:', operator);
    console.log('   Protocol Fee:', feeBasisPoints.toString(), 'basis points');

    console.log('');
    console.log('🎉 ORDERBOOK DEPLOYMENT COMPLETE!');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   ✅ OrderBookExchange: ${orderbookAddress}`);
    console.log(`   ✅ Property updated with orderbook address`);
    console.log(`   ✅ Trading interface should now work`);
    console.log('');
    console.log('💡 London Flat property page should now show:');
    console.log('   - Full trading interface with buy/sell functionality');
    console.log('   - Order placement capabilities');
    console.log('   - Market data from orderbook');
    console.log(`   - Protocol fee: 0.5% on trades`);

  } catch (error) {
    console.error('❌ Error deploying orderbook:', error.message);
  }
}

deployOrderbookForLondon().catch(console.error); 