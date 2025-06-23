const { createClient } = require('@supabase/supabase-js');

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

async function main() {
  console.log("🔧 Fixing database schema for YieldDistributor...\n");

  try {
    // fix: first check if the column exists (Cursor Rule 4)
    console.log("📋 Checking current schema...");
    const { data: tableSchema, error: schemaError } = await supabase
      .rpc('get_table_schema', { table_name: 'property_token_details' });

    if (schemaError) {
      console.log("   Using alternative method to add column...");
    }

    // fix: add yield_distributor_address column if it doesn't exist (Cursor Rule 4)
    console.log("➕ Adding yield_distributor_address column...");
    const { error: alterError } = await supabase
      .rpc('exec_sql', { 
        sql: `
          ALTER TABLE property_token_details 
          ADD COLUMN IF NOT EXISTS yield_distributor_address TEXT,
          ADD COLUMN IF NOT EXISTS yield_distributor_deployed_at TIMESTAMPTZ;
        ` 
      });

    if (alterError) {
      console.log("   Column might already exist, proceeding...");
    } else {
      console.log("   ✅ Columns added successfully");
    }

    // fix: update the specific property with YieldDistributor address (Cursor Rule 4)
    console.log("💾 Updating YieldDistributor address...");
    const { data: updateData, error: updateError } = await supabase
      .from('property_token_details')
      .update({
        yield_distributor_address: '0xa019F48fe3F705b46FB3BB509866064F4A483847',
        yield_distributor_deployed_at: new Date().toISOString()
      })
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .select();

    if (updateError) {
      console.error("❌ Update failed:", updateError.message);
      
      // Try direct insert/upsert approach
      console.log("🔄 Trying upsert approach...");
      const { data: upsertData, error: upsertError } = await supabase
        .from('property_token_details')
        .upsert({
          property_id: '795d70a0-7807-4d73-be93-b19050e9dec8',
          yield_distributor_address: '0xa019F48fe3F705b46FB3BB509866064F4A483847',
          yield_distributor_deployed_at: new Date().toISOString()
        }, { onConflict: 'property_id' })
        .select();

      if (upsertError) {
        console.error("❌ Upsert also failed:", upsertError.message);
        process.exit(1);
      } else {
        console.log("   ✅ Upsert successful:", upsertData);
      }
    } else {
      console.log("   ✅ Update successful:", updateData);
    }

    // fix: verify the update (Cursor Rule 4)
    console.log("🔍 Verifying update...");
    const { data: verifyData, error: verifyError } = await supabase
      .from('property_token_details')
      .select('property_id, token_name, yield_distributor_address, yield_distributor_deployed_at')
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single();

    if (verifyError) {
      console.error("❌ Verification failed:", verifyError.message);
      process.exit(1);
    }

    console.log("\n✅ Success! YieldDistributor address added:");
    console.log("   Property:", verifyData.token_name);
    console.log("   YieldDistributor:", verifyData.yield_distributor_address);
    console.log("   Deployed At:", verifyData.yield_distributor_deployed_at);
    console.log("\n🎉 Ready for admin testing!");

  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }); 