const { ethers } = require("hardhat");

async function main() {
  // Get deployment parameters from environment variables
  const propertyId = process.env.PROPERTY_ID;
  const tokenName = process.env.TOKEN_NAME;
  const tokenSymbol = process.env.TOKEN_SYMBOL;
  const totalShares = process.env.TOTAL_SHARES;
  const pricePerToken = process.env.PRICE_PER_TOKEN;
  const fundingGoalUsdc = process.env.FUNDING_GOAL_USDC;
  const fundingDeadline = process.env.FUNDING_DEADLINE;
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  const operatorAddress = process.env.OPERATOR_ADDRESS;

  // Validate required parameters
  if (!propertyId || !tokenName || !tokenSymbol || !totalShares || !pricePerToken || 
      !fundingGoalUsdc || !fundingDeadline || !treasuryAddress || !operatorAddress) {
    throw new Error("Missing required environment variables for deployment");
  }

  console.log("Deploying PropertyShareToken with parameters:");
  console.log("- Property ID:", propertyId);
  console.log("- Token Name:", tokenName);
  console.log("- Token Symbol:", tokenSymbol);
  console.log("- Total Shares:", totalShares);
  console.log("- Price Per Token:", pricePerToken);
  console.log("- Funding Goal USDC:", fundingGoalUsdc);
  console.log("- Funding Deadline:", fundingDeadline);
  console.log("- Treasury Address:", treasuryAddress);
  console.log("- Operator Address:", operatorAddress);

  // Get the contract factory
  const PropertyShareToken = await ethers.getContractFactory("PropertyShareToken");

  // Convert funding deadline to Unix timestamp
  const fundingDeadlineTimestamp = Math.floor(new Date(fundingDeadline).getTime() / 1000);
  
  console.log("Converted funding deadline:", fundingDeadlineTimestamp, "from:", fundingDeadline);

  // Convert property ID to numeric hash for contract
  const crypto = require('crypto');
  const propertyIdHash = crypto.createHash('sha256').update(propertyId).digest('hex');
  const propertyIdNumeric = BigInt('0x' + propertyIdHash) % (BigInt(2) ** BigInt(256));

  console.log("Property ID hash:", propertyIdNumeric.toString());

  // Convert total shares to 18 decimals for ERC20 standard
  const totalSharesWithDecimals = BigInt(totalShares) * BigInt(10 ** 18);
  
  console.log("Total shares with decimals:", totalSharesWithDecimals.toString());

  // Deploy the contract
  const propertyShareToken = await PropertyShareToken.deploy(
    tokenName,
    tokenSymbol,
    propertyIdNumeric,
    totalSharesWithDecimals,
    pricePerToken,
    fundingGoalUsdc,
    fundingDeadlineTimestamp,
    treasuryAddress,
    operatorAddress
  );

  // Wait for deployment
  await propertyShareToken.waitForDeployment();

  const contractAddress = await propertyShareToken.getAddress();
  const deploymentHash = propertyShareToken.deploymentTransaction().hash;

  console.log(`Contract deployed at: ${contractAddress}`);
  console.log(`Deployment hash: ${deploymentHash}`);

  // Verify the deployment
  console.log("Verifying deployment...");
  const propertyInfo = await propertyShareToken.getPropertyInfo();
  console.log("Property Info:", {
    propertyId: propertyInfo[0].toString(),
    totalShares: propertyInfo[1].toString(),
    pricePerToken: propertyInfo[2].toString(),
    fundingGoalUsdc: propertyInfo[3].toString(),
    fundingDeadline: propertyInfo[4].toString(),
    mintingCompleted: propertyInfo[5],
    totalMinted: propertyInfo[6].toString()
  });

  console.log("✅ PropertyShareToken deployment completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  }); 