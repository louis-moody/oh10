const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrderbookAddress() {
  console.log('🔍 Checking orderbook address for London Flat...');
  console.log('');

  try {
    // Get London Flat property with all relevant fields
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('name', 'London Flat')
      .single();

    if (propertyError) {
      console.error('❌ Error fetching property:', propertyError.message);
      return;
    }

    console.log('🏠 London Flat Property Details:');
    console.log('   Name:', property.name);
    console.log('   Status:', property.status);
    console.log('   Token Contract:', property.token_contract_address);
    console.log('   Orderbook Contract:', property.orderbook_contract_address || 'NOT SET');
    console.log('');

    // Check if orderbook address exists
    if (!property.orderbook_contract_address) {
      console.log('❌ ISSUE: No orderbook contract address found!');
      console.log('');
      console.log('💡 This means:');
      console.log('   - Trading interface may not work properly');
      console.log('   - Users cannot place buy/sell orders');
      console.log('   - OrderBook exchange contract needs to be deployed');
      console.log('');
      console.log('🔧 SOLUTION: Need to deploy OrderBookExchange contract');
      console.log('   and update the properties table with the address.');
    } else {
      console.log('✅ Orderbook contract address is set!');
      console.log('   Address:', property.orderbook_contract_address);
      
      // Check if the trading interface should be available
      const isLive = property.status === 'completed' || property.status === 'funded';
      console.log('   Trading Available:', isLive ? 'YES' : 'NO');
      console.log('   Reason:', isLive ? 'Property is funded/completed' : `Property status is '${property.status}'`);
    }

    // Also check property_token_details to see what orderbook info is there
    console.log('');
    console.log('📋 Checking property_token_details...');
    const { data: tokenDetails } = await supabase
      .from('property_token_details')
      .select('*')
      .eq('property_id', property.id)
      .single();

    if (tokenDetails) {
      console.log('   Token Contract:', tokenDetails.contract_address);
      console.log('   Symbol:', tokenDetails.token_symbol);
      console.log('   Minting Completed:', tokenDetails.minting_completed);
      
      // Check if there's an orderbook field here too
      if ('orderbook_contract_address' in tokenDetails) {
        console.log('   Orderbook Contract:', tokenDetails.orderbook_contract_address || 'NOT SET');
      }
    }

  } catch (error) {
    console.error('❌ Error checking orderbook:', error.message);
  }
}

checkOrderbookAddress().catch(console.error); 