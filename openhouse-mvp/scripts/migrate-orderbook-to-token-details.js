const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateOrderbookToTokenDetails() {
  console.log('🔧 Migrating orderbook addresses to property_token_details table...');
  console.log('');

  try {
    // Step 1: Add the column via SQL
    console.log('📋 Step 1: Adding orderbook_contract_address column...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE property_token_details ADD COLUMN IF NOT EXISTS orderbook_contract_address TEXT;'
    });

    if (alterError) {
      console.error('❌ Error adding column:', alterError.message);
      console.log('');
      console.log('⚠️  Please run this SQL manually in Supabase SQL Editor:');
      console.log('   ALTER TABLE property_token_details ADD COLUMN orderbook_contract_address TEXT;');
      console.log('');
      console.log('💡 Then run this script again to migrate the data');
      return;
    }

    console.log('✅ Column added successfully!');
    console.log('');

    // Step 2: Migrate data from properties table
    console.log('📋 Step 2: Migrating orderbook addresses from properties table...');
    
    // Get all properties that have both token details and orderbook addresses
    const { data: propertiesWithOrderbooks, error: fetchError } = await supabase
      .from('properties')
      .select(`
        id, 
        name, 
        orderbook_contract_address,
        property_token_details(property_id, contract_address, token_symbol)
      `)
      .not('orderbook_contract_address', 'is', null)
      .not('property_token_details', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching properties:', fetchError.message);
      return;
    }

    console.log(`Found ${propertiesWithOrderbooks?.length || 0} properties with orderbook addresses`);
    console.log('');

    // Update each property's token details
    let successCount = 0;
    let errorCount = 0;

    for (const property of propertiesWithOrderbooks || []) {
      console.log(`🔄 Updating ${property.name}...`);
      console.log(`   Property ID: ${property.id}`);
      console.log(`   Orderbook: ${property.orderbook_contract_address}`);

      const { error: updateError } = await supabase
        .from('property_token_details')
        .update({
          orderbook_contract_address: property.orderbook_contract_address
        })
        .eq('property_id', property.id);

      if (updateError) {
        console.log(`   ❌ Failed: ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`   ✅ Success`);
        successCount++;
      }
      console.log('');
    }

    // Step 3: Verify the migration
    console.log('📋 Step 3: Verifying migration...');
    const { data: verificationData } = await supabase
      .from('property_token_details')
      .select('property_id, contract_address, orderbook_contract_address, token_symbol')
      .not('orderbook_contract_address', 'is', null);

    console.log('✅ MIGRATION SUMMARY:');
    console.log(`   Properties processed: ${(propertiesWithOrderbooks?.length || 0)}`);
    console.log(`   Successful updates: ${successCount}`);
    console.log(`   Failed updates: ${errorCount}`);
    console.log(`   Records with orderbook addresses: ${verificationData?.length || 0}`);
    console.log('');

    if (verificationData && verificationData.length > 0) {
      console.log('📋 Verified records:');
      verificationData.forEach(record => {
        console.log(`   ${record.token_symbol}: ${record.orderbook_contract_address}`);
      });
      console.log('');
    }

    console.log('🎉 MIGRATION COMPLETE!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. ✅ Update frontend to read orderbook_contract_address from property_token_details');
    console.log('   2. ✅ Remove the dual-table fetch logic');
    console.log('   3. ✅ All token-related data now in one place');
    console.log('   4. 🔄 Update future deployment scripts to populate both tables');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
  }
}

migrateOrderbookToTokenDetails(); 