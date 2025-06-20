const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simpleOrderbookMigration() {
  console.log('🔧 Simple orderbook migration to property_token_details...');
  console.log('');

  try {
    // Get London Flat property details from both tables
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
    console.log('   Orderbook from properties table:', property.orderbook_contract_address);
    console.log('');

    // Try to update property_token_details directly
    console.log('📋 Attempting to update property_token_details...');
    
    const { data, error: updateError } = await supabase
      .from('property_token_details')
      .update({
        orderbook_contract_address: property.orderbook_contract_address
      })
      .eq('property_id', property.id)
      .select();

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      console.log('');
      console.log('🔧 MANUAL STEPS REQUIRED:');
      console.log('');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Run this SQL command:');
      console.log('');
      console.log('   ALTER TABLE property_token_details ADD COLUMN orderbook_contract_address TEXT;');
      console.log('');
      console.log('3. Then run this SQL to migrate the data:');
      console.log('');
      console.log(`   UPDATE property_token_details 
   SET orderbook_contract_address = '${property.orderbook_contract_address}'
   WHERE property_id = '${property.id}';`);
      console.log('');
      console.log('4. Then run this script again to verify');
      return;
    }

    console.log('✅ Successfully updated property_token_details!');
    console.log('Updated records:', data?.length || 0);
    console.log('');

    // Verify the update
    console.log('🔍 Verifying update...');
    const { data: verification } = await supabase
      .from('property_token_details')
      .select('contract_address, orderbook_contract_address, token_symbol')
      .eq('property_id', property.id)
      .single();

    if (verification) {
      console.log('✅ Verification successful:');
      console.log('   Token Contract:', verification.contract_address);
      console.log('   Orderbook Contract:', verification.orderbook_contract_address);
      console.log('   Token Symbol:', verification.token_symbol);
      console.log('');
      console.log('🎉 PERFECT! Now updating frontend code...');
      
      return { success: true, verification };
    }

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    return { success: false, error: error.message };
  }
}

simpleOrderbookMigration()
  .then(result => {
    if (result?.success) {
      console.log('');
      console.log('📝 NEXT STEPS:');
      console.log('   ✅ Database migration complete');
      console.log('   🔄 Update frontend to only read from property_token_details');
      console.log('   🧹 Remove dual-table fetch logic');
      console.log('   📋 All token data now centralized');
    }
  }); 