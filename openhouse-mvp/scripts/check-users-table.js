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
  console.log("🔍 Checking users table structure...\n");

  try {
    // fix: check what columns exist in users table (Cursor Rule 6)
    console.log("📋 Fetching users table structure:");
    
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(5);

    if (usersError) {
      console.error("❌ Error fetching users:", usersError);
      return;
    }

    if (users.length === 0) {
      console.log("⚠️  No users found in table");
      return;
    }

    console.log(`✅ Found ${users.length} users. Table columns:`);
    const columns = Object.keys(users[0]);
    columns.forEach(col => {
      console.log(`   • ${col}`);
    });

    console.log("\n📋 Sample user data:");
    users.forEach((user, index) => {
      console.log(`   User ${index + 1}:`);
      columns.forEach(col => {
        console.log(`     ${col}: ${user[col]}`);
      });
      console.log("");
    });

    // fix: check if we need to add role column (Cursor Rule 6)
    if (!columns.includes('role')) {
      console.error("❌ Missing 'role' column in users table!");
      console.log("\n🔧 SQL to fix this:");
      console.log(`
-- Add role column to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- Set admin role for specific wallet (update with your wallet address)
UPDATE users SET role = 'admin' WHERE wallet_address = 'YOUR_WALLET_ADDRESS_HERE';

-- Add constraint for valid roles
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
      `);
    } else {
      console.log("✅ 'role' column exists!");
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