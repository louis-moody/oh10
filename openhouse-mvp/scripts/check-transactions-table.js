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
  console.log("🔍 Checking transactions table structure...\n");

  try {
    // fix: check what columns exist in transactions table (Cursor Rule 6)
    console.log("📋 Fetching transactions table structure:");
    
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('*')
      .limit(5);

    if (transactionsError) {
      console.error("❌ Error fetching transactions:", transactionsError);
      return;
    }

    if (transactions.length === 0) {
      console.log("⚠️  No transactions found in table");
      
      // fix: check if table exists by trying to get schema info (Cursor Rule 6)
      console.log("\n🔍 Checking if table exists...");
      const { error: schemaError } = await supabase
        .from('transactions')
        .select('count')
        .limit(1);
        
      if (schemaError) {
        console.error("❌ transactions table might not exist:", schemaError);
      }
      return;
    }

    console.log(`✅ Found ${transactions.length} transactions. Table columns:`);
    const columns = Object.keys(transactions[0]);
    columns.forEach(col => {
      console.log(`   • ${col}`);
    });

    console.log("\n📋 Sample transactions data:");
    transactions.forEach((transaction, index) => {
      console.log(`   Transaction ${index + 1}:`);
      columns.forEach(col => {
        console.log(`     ${col}: ${transaction[col]}`);
      });
      console.log("");
    });

    // fix: check what columns are available for queries (Cursor Rule 6)
    console.log("📝 Query analysis:");
    if (columns.includes('user_address')) {
      console.log("✅ Found 'user_address' column for wallet queries");
    }
    if (columns.includes('user_id')) {
      console.log("✅ Found 'user_id' column for user queries");
    }
    if (columns.includes('price_per_token')) {
      console.log("✅ Found 'price_per_token' column for pricing queries");
    } else {
      console.log("❌ Missing 'price_per_token' column - this might cause query errors");
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