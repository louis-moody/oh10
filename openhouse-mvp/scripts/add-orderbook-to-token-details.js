const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ORDERBOOK_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function addOrderbookToTokenDetails() {
  console.log('🔧 Adding orderbook_contract_address column to property_token_details...');
  console.log('Target address:', ORDERBOOK_ADDRESS);
  console.log('');

  try {
    // First, let's check the current structure of property_token_details
    console.log('📋 Checking current property_token_details structure...');
    const { data: tokenDetails, error: fetchError } = await supabase
      .from('property_token_details')
      .select('*')
      .limit(1);

    if (fetchError) {
      console.error('❌ Error fetching token details:', fetchError.message);
      return;
    }

    if (tokenDetails && tokenDetails.length > 0) {
      console.log('✅ Current columns:', Object.keys(tokenDetails[0]).join(', '));
      
      // Check if orderbook_contract_address already exists
      if ('orderbook_contract_address' in tokenDetails[0]) {
        console.log('✅ orderbook_contract_address column already exists!');
      } else {
        console.log('❌ orderbook_contract_address column does not exist');
        console.log('');
        console.log('⚠️  We need to add this column via Supabase dashboard or SQL migration');
        console.log('   The column should be: orderbook_contract_address TEXT');
        console.log('');
        console.log('💡 For now, let\'s try to update assuming the column exists...');
      }
    }

    // Get London Flat property details
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, name, orderbook_contract_address')
      .eq('name', 'London Flat')
      .single();

    if (propertyError) {
      console.error('❌ Error fetching property:', propertyError.message);
      return;
    }

    console.log('🏠 Property found:', property.name);
    console.log('   ID:', property.id);
    console.log('   Orderbook in properties table:', property.orderbook_contract_address);
    console.log('');

    // Try to update property_token_details with orderbook address
    console.log('📋 Updating property_token_details with orderbook address...');
    const { data, error: updateError } = await supabase
      .from('property_token_details')
      .update({
        orderbook_contract_address: ORDERBOOK_ADDRESS
      })
      .eq('property_id', property.id)
      .select();

    if (updateError) {
      console.error('❌ Error updating property_token_details:', updateError.message);
      console.log('');
      console.log('🔧 SOLUTION NEEDED:');
      console.log('   1. Add orderbook_contract_address column to property_token_details table');
      console.log('   2. Column type: TEXT');
      console.log('   3. Then run this script again');
      console.log('');
      console.log('📝 SQL to run in Supabase SQL Editor:');
      console.log('   ALTER TABLE property_token_details ADD COLUMN orderbook_contract_address TEXT;');
      return;
    }

    console.log('✅ Successfully updated property_token_details!');
    console.log('Updated records:', data?.length || 0);
    console.log('');

    // Verify the update
    console.log('🔍 Verifying update...');
    const { data: updatedTokenDetails } = await supabase
      .from('property_token_details')
      .select('contract_address, orderbook_contract_address, token_symbol')
      .eq('property_id', property.id)
      .single();

    if (updatedTokenDetails) {
      console.log('✅ Verification successful:');
      console.log('   Token Contract:', updatedTokenDetails.contract_address);
      console.log('   Orderbook Contract:', updatedTokenDetails.orderbook_contract_address);
      console.log('   Token Symbol:', updatedTokenDetails.token_symbol);
      console.log('');
      console.log('🎉 PERFECT! Now we can update the frontend to only read from property_token_details');
      console.log('   ✅ All token-related data in one place');
      console.log('   ✅ Better data architecture');
      console.log('   ✅ Cleaner frontend code');
      console.log('');
      console.log('💡 Next step: Update frontend to only fetch from property_token_details');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addOrderbookToTokenDetails(); 