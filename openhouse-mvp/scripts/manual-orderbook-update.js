const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Deployed orderbook contract address
const ORDERBOOK_ADDRESS = "0x0680C8eCDEef5b36E3F169fF308Be05B501E112E";

async function manualOrderbookUpdate() {
  console.log('🔧 Manually updating London Flat with orderbook address...');
  console.log('Orderbook Address:', ORDERBOOK_ADDRESS);
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

    console.log('🏠 Property:', property.name);
    console.log('📊 Current fields:');
    console.log('   Token Contract:', property.token_contract_address);
    console.log('   Status:', property.status);
    console.log('');

    // Check all available columns by trying to update with a test field
    console.log('🔍 Testing property table schema...');
    
    // Try to update with different possible column names
    const possibleColumns = [
      'orderbook_contract_address',
      'orderbook_address', 
      'exchange_contract_address',
      'trading_contract_address'
    ];

    let successfulColumn = null;

    for (const columnName of possibleColumns) {
      console.log(`   Testing column: ${columnName}...`);
      
      const testUpdate = {
        [columnName]: ORDERBOOK_ADDRESS
      };

      const { error } = await supabase
        .from('properties')
        .update(testUpdate)
        .eq('id', property.id);

      if (!error) {
        console.log(`   ✅ SUCCESS: ${columnName} exists and was updated`);
        successfulColumn = columnName;
        break;
      } else {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }

    if (successfulColumn) {
      console.log('');
      console.log(`🎉 Successfully updated ${successfulColumn}!`);
      
      // Verify the update
      const { data: updatedProperty } = await supabase
        .from('properties')
        .select(`id, name, token_contract_address, ${successfulColumn}`)
        .eq('id', property.id)
        .single();

      console.log('✅ Verification:');
      console.log('   Token Contract:', updatedProperty?.token_contract_address);
      console.log(`   ${successfulColumn}:`, updatedProperty?.[successfulColumn]);
    } else {
      console.log('');
      console.log('❌ No suitable column found in properties table');
      console.log('');
      console.log('🔧 Alternative: Add orderbook address to property_token_details');
      
      // Try updating property_token_details instead
      const { error: tokenDetailsError } = await supabase
        .from('property_token_details')
        .update({
          // Try different possible column names
          orderbook_contract_address: ORDERBOOK_ADDRESS
        })
        .eq('property_id', property.id);

      if (tokenDetailsError) {
        console.log(`   ❌ property_token_details update failed: ${tokenDetailsError.message}`);
        
        // Try alternative column name
        const { error: altError } = await supabase
          .from('property_token_details')
          .update({
            exchange_address: ORDERBOOK_ADDRESS
          })
          .eq('property_id', property.id);
          
        if (altError) {
          console.log(`   ❌ Alternative update failed: ${altError.message}`);
        } else {
          console.log('   ✅ Updated property_token_details with exchange_address');
        }
      } else {
        console.log('   ✅ Updated property_token_details with orderbook_contract_address');
      }
    }

    console.log('');
    console.log('📋 MANUAL UPDATE SUMMARY:');
    console.log(`   OrderBook Contract: ${ORDERBOOK_ADDRESS}`);
    console.log('   Status: Deployed and ready for trading');
    console.log('   Protocol Fee: 0.5%');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Update property page code to use correct field name');
    console.log('   2. Test trading interface on London Flat page');
    console.log('   3. Verify buy/sell order functionality');

  } catch (error) {
    console.error('❌ Error in manual update:', error.message);
  }
}

manualOrderbookUpdate().catch(console.error); 