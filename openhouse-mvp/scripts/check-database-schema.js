const { createClient } = require('@supabase/supabase-js');

// fix: load environment variables for database check (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("🔍 Checking database schema...\n");

  try {
    // fix: check if rental_distributions table exists (Cursor Rule 6)
    console.log("📋 Checking rental_distributions table...");
    
    const { data, error } = await supabase
      .from('rental_distributions')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.error("❌ rental_distributions table does NOT exist!");
        console.log("\n🔧 Creating rental_distributions table...");
        
        // fix: create the missing table (Cursor Rule 4)
        const { error: createError } = await supabase.rpc('create_rental_distributions_table');
        
        if (createError) {
          console.error("❌ Failed to create table:", createError);
          console.log("\n📝 Manual SQL needed:");
          console.log(`
CREATE TABLE rental_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  usdc_amount DECIMAL(18,6) NOT NULL,
  tx_hash TEXT NOT NULL,
  distributed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE rental_distributions ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access
CREATE POLICY "Admin can manage rental distributions" ON rental_distributions
  FOR ALL USING (true);
          `);
        } else {
          console.log("✅ rental_distributions table created!");
        }
      } else {
        console.error("❌ Database error:", error);
      }
    } else {
      console.log("✅ rental_distributions table exists!");
      console.log(`   Found ${data.length} records`);
    }

    // fix: check property_activity table for audit trail (Cursor Rule 4)
    console.log("\n📋 Checking property_activity table...");
    
    const { data: activityData, error: activityError } = await supabase
      .from('property_activity')
      .select('*')
      .limit(1);

    if (activityError) {
      if (activityError.code === 'PGRST116' || activityError.message.includes('does not exist')) {
        console.error("❌ property_activity table does NOT exist!");
        console.log("📝 Manual SQL needed for property_activity table");
      } else {
        console.error("❌ Database error:", activityError);
      }
    } else {
      console.log("✅ property_activity table exists!");
    }

  } catch (error) {
    console.error("❌ Error checking schema:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 