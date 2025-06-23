const { createClient } = require('@supabase/supabase-js');

// fix: load environment variables for admin check (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("🔍 Checking admin status...\n");

  try {
    // fix: first check all users to see what's in the database (Cursor Rule 6)
    console.log("📋 All users in database:");
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('wallet_address, role, created_at')
      .order('created_at', { ascending: false });

    if (allUsersError) {
      console.error("❌ Error fetching all users:", allUsersError);
      return;
    }

    console.log(`   Found ${allUsers.length} users:`);
    allUsers.forEach(user => {
      console.log(`   • ${user.wallet_address} (${user.role}) - ${user.created_at}`);
    });

    // fix: check the wallet address from the console logs (Cursor Rule 6)
    const testWallet = "0x71c8cb81"; // From the console logs "Signing with 0x71c8...cb81"
    
    // fix: get user from database (Cursor Rule 4)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .ilike('wallet_address', `%${testWallet}%`); // Use partial match

    if (userError) {
      console.error("❌ Error fetching user:", userError);
      return;
    }

    if (!user || user.length === 0) {
      console.error("❌ No user found matching wallet pattern");
      return;
    }

    const foundUser = user[0]; // Get first match
    console.log("\n👤 User found:");
    console.log("   Wallet:", foundUser.wallet_address);
    console.log("   Role:", foundUser.role);
    console.log("   Created:", foundUser.created_at);

    if (foundUser.role !== 'admin') {
      console.error("❌ User is not an admin!");
      console.log("\n🔧 To fix this, run:");
      console.log(`UPDATE users SET role = 'admin' WHERE wallet_address = '${foundUser.wallet_address}';`);
    } else {
      console.log("✅ User has admin role!");
    }

    // fix: check active sessions (Cursor Rule 4)
    console.log("\n🔍 Checking active sessions...");
    const { data: sessions, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('wallet_address', foundUser.wallet_address)
      .eq('is_active', true);

    if (sessionError) {
      console.error("❌ Error fetching sessions:", sessionError);
    } else {
      console.log(`📋 Active sessions: ${sessions.length}`);
      sessions.forEach(session => {
        console.log(`   Session ID: ${session.session_id}`);
        console.log(`   Created: ${session.created_at}`);
        console.log(`   Expires: ${session.expires_at}`);
      });
    }

  } catch (error) {
    console.error("❌ Error checking admin status:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 