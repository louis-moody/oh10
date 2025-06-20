const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// New token details
const NEW_TOKEN_CONTRACT = "0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F";
const USER_WALLET = "0xf8978edbab4e9f095581c0ab69c9e13acfd8d485";
const TOKEN_SYMBOL = "OH10F";
const USER_TOKEN_BALANCE = 50;
const USER_INVESTED_USDC = 50;

async function updateSupabaseTokenDetails() {
  console.log('📋 Updating Supabase with new token details...');
  console.log('New Token Contract:', NEW_TOKEN_CONTRACT);
  console.log('User Wallet:', USER_WALLET);
  console.log('Token Balance:', USER_TOKEN_BALANCE);
  console.log('');

  try {
    // Get London Flat property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('name', 'London Flat')
      .single();

    if (propertyError) {
      console.error('❌ Error fetching property:', propertyError.message);
      return;
    }

    console.log('🏠 Found property:', property.name);
    console.log('📊 Property ID:', property.id);
    console.log('🔗 Old token contract:', property.token_contract_address);
    console.log('');

    // Update properties table with new token contract address
    console.log('1️⃣ Updating properties table...');
    const { error: updatePropertyError } = await supabase
      .from('properties')
      .update({
        token_contract_address: NEW_TOKEN_CONTRACT
      })
      .eq('id', property.id);

    if (updatePropertyError) {
      console.log(`   ❌ Failed: ${updatePropertyError.message}`);
    } else {
      console.log('   ✅ Properties table updated successfully');
    }

    // Update property_token_details table
    console.log('2️⃣ Updating property_token_details table...');
    const { error: updateTokenDetailsError } = await supabase
      .from('property_token_details')
      .update({
        contract_address: NEW_TOKEN_CONTRACT,
        symbol: TOKEN_SYMBOL
      })
      .eq('property_id', property.id);

    if (updateTokenDetailsError) {
      console.log(`   ❌ Failed: ${updateTokenDetailsError.message}`);
    } else {
      console.log('   ✅ Property token details updated successfully');
    }

    // Update/create user_holdings record
    console.log('3️⃣ Updating user_holdings table...');
    const { error: updateHoldingsError } = await supabase
      .from('user_holdings')
      .upsert({
        wallet_address: USER_WALLET,
        property_id: property.id,
        token_amount: USER_TOKEN_BALANCE,
        total_invested_usdc: USER_INVESTED_USDC
      }, {
        onConflict: 'wallet_address,property_id'
      });

    if (updateHoldingsError) {
      console.log(`   ❌ Failed: ${updateHoldingsError.message}`);
    } else {
      console.log('   ✅ User holdings updated successfully');
    }

    // Verify updates
    console.log('');
    console.log('🔍 Verifying updates...');
    
    // Check updated property
    const { data: updatedProperty } = await supabase
      .from('properties')
      .select('token_contract_address')
      .eq('id', property.id)
      .single();

    console.log('   Property token contract:', updatedProperty?.token_contract_address);

    // Check updated token details
    const { data: updatedTokenDetails } = await supabase
      .from('property_token_details')
      .select('contract_address, symbol')
      .eq('property_id', property.id)
      .single();

    console.log('   Token details contract:', updatedTokenDetails?.contract_address);
    console.log('   Token details symbol:', updatedTokenDetails?.symbol);

    // Check user holdings
    const { data: updatedHoldings } = await supabase
      .from('user_holdings')
      .select('*')
      .eq('wallet_address', USER_WALLET)
      .eq('property_id', property.id)
      .single();

    console.log('   User holdings:', updatedHoldings?.token_amount, 'tokens');
    console.log('   User investment:', `$${updatedHoldings?.total_invested_usdc}`);

    console.log('');
    console.log('🎉 SUPABASE UPDATE COMPLETE!');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   ✅ Property updated with contract: ${NEW_TOKEN_CONTRACT}`);
    console.log(`   ✅ Token details updated with symbol: ${TOKEN_SYMBOL}`);
    console.log(`   ✅ User holdings: ${USER_TOKEN_BALANCE} tokens`);
    console.log('');
    console.log('💡 The London Flat property page should now show:');
    console.log('   - Trading interface (not crowdfunding)');
    console.log(`   - Correct token contract: ${NEW_TOKEN_CONTRACT}`);
    console.log('   - Your balance in the trading interface');

  } catch (error) {
    console.error('❌ Error updating Supabase:', error.message);
  }
}

updateSupabaseTokenDetails().catch(console.error); 