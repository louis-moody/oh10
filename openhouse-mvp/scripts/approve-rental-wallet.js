const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('hardhat');

// fix: load environment variables for rental wallet approval (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rentalWalletPrivateKey = process.env.RENTAL_WALLET_PRIVATE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables");
  process.exit(1);
}

if (!rentalWalletPrivateKey) {
  console.error("❌ Missing RENTAL_WALLET_PRIVATE_KEY environment variable");
  console.error("   Add this to your .env.local file with the rental wallet's private key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// fix: USDC contract ABI for approval transactions (Cursor Rule 4)
const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

async function main() {
  console.log("🔐 Setting up YieldDistributor approval from rental wallet...\n");

  try {
    // fix: get property token details from Supabase (Cursor Rule 4)
    const { data: tokenDetails, error } = await supabase
      .from('property_token_details')
      .select('*')
      .eq('property_id', '795d70a0-7807-4d73-be93-b19050e9dec8')
      .single();

    if (error || !tokenDetails) {
      console.error("❌ Failed to fetch token details:", error);
      return;
    }

    console.log("📋 Contract Details:");
    console.log("   YieldDistributor:", tokenDetails.yield_distributor_address);
    console.log("   Rental Wallet:", tokenDetails.rental_wallet_address);
    console.log("");

    // fix: connect to Base Sepolia with rental wallet (Cursor Rule 4)
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
    const rentalWallet = new ethers.Wallet(rentalWalletPrivateKey, provider);
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    console.log("🔗 Connected to rental wallet:", rentalWallet.address);
    
    // fix: verify this is the correct rental wallet address (Cursor Rule 6)
    if (rentalWallet.address.toLowerCase() !== tokenDetails.rental_wallet_address.toLowerCase()) {
      console.error("❌ MISMATCH: Private key doesn't match rental wallet address!");
      console.error("   Expected:", tokenDetails.rental_wallet_address);
      console.error("   Got:", rentalWallet.address);
      return;
    }

    const usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, rentalWallet);

    // fix: check current state before approval (Cursor Rule 4)
    const currentBalance = await usdcContract.balanceOf(rentalWallet.address);
    const currentAllowance = await usdcContract.allowance(
      rentalWallet.address,
      tokenDetails.yield_distributor_address
    );

    console.log("💰 Current Status:");
    console.log("   USDC Balance:", ethers.formatUnits(currentBalance, 6), "USDC");
    console.log("   Current Allowance:", ethers.formatUnits(currentAllowance, 6), "USDC");
    console.log("");

    // fix: set approval amount (large enough for multiple distributions) (Cursor Rule 4)
    const approvalAmount = ethers.parseUnits("1000", 6); // 1000 USDC allowance
    
    console.log("🔓 Approving YieldDistributor for USDC spending...");
    console.log("   Approval Amount:", ethers.formatUnits(approvalAmount, 6), "USDC");
    console.log("   Spender:", tokenDetails.yield_distributor_address);
    console.log("");

    // fix: send approval transaction (Cursor Rule 4)
    const approveTx = await usdcContract.approve(
      tokenDetails.yield_distributor_address,
      approvalAmount
    );

    console.log("📝 Transaction sent:", approveTx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await approveTx.wait();
    
    if (receipt.status === 1) {
      console.log("✅ Approval successful!");
      console.log("");

      // fix: verify the approval worked (Cursor Rule 4)
      const newAllowance = await usdcContract.allowance(
        rentalWallet.address,
        tokenDetails.yield_distributor_address
      );

      console.log("🎉 Setup Complete!");
      console.log("   New Allowance:", ethers.formatUnits(newAllowance, 6), "USDC");
      console.log("   Transaction:", `https://sepolia.basescan.org/tx/${approveTx.hash}`);
      console.log("");
      console.log("✨ The operator can now call pullAndDistribute anytime!");
      console.log("   This allowance will cover", Math.floor(Number(ethers.formatUnits(newAllowance, 6))), "distributions of 1 USDC each");

    } else {
      console.error("❌ Approval transaction failed");
    }

  } catch (error) {
    console.error("❌ Error during approval:", error);
    
    if (error.message.includes("insufficient funds")) {
      console.error("\n💡 The rental wallet needs ETH for gas fees");
      console.error("   Send some ETH to:", rentalWallet?.address || "rental wallet");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 