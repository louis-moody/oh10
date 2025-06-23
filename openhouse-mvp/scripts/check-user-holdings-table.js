const { createClient } = require('@supabase/supabase-js');

// fix: load environment variables for table check (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("🔍 Checking user_holdings table structure...\n");

  try {
    // fix: check what columns exist in user_holdings table (Cursor Rule 6)
    console.log("📋 Fetching user_holdings table structure:");
    
    const { data: holdings, error: holdingsError } = await supabase
      .from('user_holdings')
      .select('*')
      .limit(5);

    if (holdingsError) {
      console.error("❌ Error fetching user_holdings:", holdingsError);
      return;
    }

    if (holdings.length === 0) {
      console.log("⚠️  No holdings found in table");
      
      // fix: check if table exists by trying to get schema info (Cursor Rule 6)
      console.log("\n🔍 Checking if table exists...");
      const { error: schemaError } = await supabase
        .from('user_holdings')
        .select('count')
        .limit(1);
        
      if (schemaError) {
        console.error("❌ user_holdings table might not exist:", schemaError);
        console.log("\n📝 Expected table structure:");
        console.log(`
CREATE TABLE user_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id),
  shares DECIMAL NOT NULL,
  token_contract TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_holdings ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
CREATE POLICY "Users can view their own holdings" ON user_holdings
  FOR SELECT USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
        `);
      }
      return;
    }

    console.log(`✅ Found ${holdings.length} holdings. Table columns:`);
    const columns = Object.keys(holdings[0]);
    columns.forEach(col => {
      console.log(`   • ${col}`);
    });

    console.log("\n📋 Sample holdings data:");
    holdings.forEach((holding, index) => {
      console.log(`   Holding ${index + 1}:`);
      columns.forEach(col => {
        console.log(`     ${col}: ${holding[col]}`);
      });
      console.log("");
    });

    // fix: check if wallet_address column exists (Cursor Rule 6)
    if (!columns.includes('wallet_address')) {
      console.error("❌ Missing 'wallet_address' column in user_holdings table!");
      if (columns.includes('user_id')) {
        console.log("✅ Found 'user_id' column - wallet queries should use this instead");
      }
    } else {
      console.log("✅ 'wallet_address' column exists!");
    }

  } catch (error) {
    console.error("❌ Error checking table:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 