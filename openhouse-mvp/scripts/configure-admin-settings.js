const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Configure Admin Settings for Simplified Trading
 * Run this after Phase 1 migration to set up fallback configuration
 * 
 * Usage: node scripts/configure-admin-settings.js [fallback_wallet_address]
 * Example: node scripts/configure-admin-settings.js 0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553
 */
async function configureAdminSettings() {
  console.log('🔧 Configuring Admin Settings for Simplified Trading...\n');

  // Get fallback wallet address from command line argument
  const fallbackWalletAddress = process.argv[2];
  
  if (!fallbackWalletAddress) {
    console.error('❌ Error: Fallback wallet address is required');
    console.log('Usage: node scripts/configure-admin-settings.js [fallback_wallet_address]');
    console.log('Example: node scripts/configure-admin-settings.js 0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553');
    process.exit(1);
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(fallbackWalletAddress)) {
    console.error('❌ Error: Invalid wallet address format');
    console.log('Wallet address must be 42 characters starting with 0x');
    process.exit(1);
  }

  try {
    console.log('📋 Configuration:');
    console.log(`   Fallback Wallet: ${fallbackWalletAddress}`);
    console.log(`   Max Slippage: 1% (100 basis points)`);
    console.log(`   Timeout: 5 seconds`);
    console.log('');

    // Configure admin settings
    const settings = [
      {
        setting_key: 'fallback_wallet_address',
        setting_value: fallbackWalletAddress,
        description: 'Fallback wallet for providing liquidity when order book is insufficient',
        is_sensitive: true
      },
      {
        setting_key: 'fallback_max_slippage_bps',
        setting_value: '100',
        description: 'Maximum slippage tolerance for fallback trades in basis points (1%)',
        is_sensitive: false
      },
      {
        setting_key: 'fallback_timeout_seconds',
        setting_value: '5',
        description: 'Time to wait for order book matching before falling back',
        is_sensitive: false
      }
    ];

    console.log('⚙️ Inserting admin settings...');
    
    for (const setting of settings) {
      const { error } = await supabase
        .from('admin_settings')
        .upsert(setting, { 
          onConflict: 'setting_key',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`❌ Failed to insert ${setting.setting_key}:`, error.message);
      } else {
        console.log(`✅ Configured: ${setting.setting_key}`);
      }
    }

    console.log('\n🎉 Admin settings configuration completed!');
    console.log('\nNext steps:');
    console.log('1. Verify settings in Supabase admin_settings table');
    console.log('2. Proceed with Phase 3: Trading Modal UI Implementation');

  } catch (error) {
    console.error('❌ Configuration failed:', error.message);
    process.exit(1);
  }
}

// Run configuration
configureAdminSettings().catch(console.error); 