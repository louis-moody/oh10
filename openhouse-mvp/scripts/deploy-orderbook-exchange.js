const { createClient } = require('@supabase/supabase-js');
const hre = require("hardhat");
const { ethers } = require("hardhat");

// fix: get wallet addresses from environment variables (Cursor Rule 4)
const DEPLOYER_ADDRESS = process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
const OPERATOR_ADDRESS = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS;
const FALLBACK_ADDRESS = process.env.NEXT_PUBLIC_FALLBACK_ADDRESS;

// fix: validate required environment variables (Cursor Rule 6)
const requiredAddresses = {
  NEXT_PUBLIC_DEPLOYER_ADDRESS: DEPLOYER_ADDRESS,
  NEXT_PUBLIC_TREASURY_ADDRESS: TREASURY_ADDRESS,
  NEXT_PUBLIC_OPERATOR_ADDRESS: OPERATOR_ADDRESS,
  NEXT_PUBLIC_FALLBACK_ADDRESS: FALLBACK_ADDRESS
};

for (const [envVar, value] of Object.entries(requiredAddresses)) {
  if (!value) {
    console.error(`❌ ${envVar} environment variable not set`);
    process.exit(1);
  }
}

// fix: USDC token addresses for Base network (Cursor Rule 4)
const USDC_ADDRESSES = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // Base Mainnet USDC
};

async function main() {
  // Get deployment parameters from environment variables
  const propertyId = process.env.PROPERTY_ID;
  const propertyTokenAddress = process.env.PROPERTY_TOKEN_ADDRESS;
  const usdcTokenAddress = process.env.USDC_TOKEN_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  const operatorAddress = process.env.OPERATOR_ADDRESS;
  const protocolFeeBasisPoints = process.env.PROTOCOL_FEE_BASIS_POINTS || '50';

  // Validate required parameters
  if (!propertyId || !propertyTokenAddress || !usdcTokenAddress || 
      !treasuryAddress || !operatorAddress) {
    throw new Error("Missing required environment variables for OrderBook deployment");
  }

  console.log("Deploying OrderBookExchange with parameters:");
  console.log("- Property ID:", propertyId);
  console.log("- Property Token Address:", propertyTokenAddress);
  console.log("- USDC Token Address:", usdcTokenAddress);
  console.log("- Treasury Address:", treasuryAddress);
  console.log("- Operator Address:", operatorAddress);
  console.log("- Protocol Fee (basis points):", protocolFeeBasisPoints);

  // Get the contract factory
  const OrderBookExchange = await ethers.getContractFactory("OrderBookExchange");

  // Deploy the contract
  const orderBookExchange = await OrderBookExchange.deploy(
    propertyId,
    propertyTokenAddress,
    usdcTokenAddress,
    treasuryAddress,
    operatorAddress,
    protocolFeeBasisPoints
  );

  // Wait for deployment
  await orderBookExchange.waitForDeployment();

  const contractAddress = await orderBookExchange.getAddress();
  const deploymentHash = orderBookExchange.deploymentTransaction().hash;

  console.log(`Contract deployed at: ${contractAddress}`);
  console.log(`Deployment hash: ${deploymentHash}`);

  console.log("✅ OrderBookExchange deployment completed successfully");
}

// fix: handle deployment errors gracefully (Cursor Rule 6)
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("OrderBook deployment failed:", error);
    process.exit(1);
  }); 