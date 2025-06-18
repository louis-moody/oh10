import hre from "hardhat";
import { createClient } from '@supabase/supabase-js';

const { ethers } = hre;

// fix: load environment variables for deployment (Cursor Rule 3)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// fix: predefined wallet addresses matching OpenHouse architecture (Cursor Rule 4)
const WALLET_ADDRESSES = {
  DEPLOYER: "0x71c835E77B2Cc377fcfd9a37685Fea81a334cb81",
  TREASURY: "0xC69Fbb757554c92B3637C2eAf1CAA80aF1D25819", 
  FALLBACK_WALLET: "0x1F9D470a3B226D2d2263e6dE6fb3EeeC9dc39553",
  OPERATOR: "0x88c245fBdbD7e8f75AEE3CCC274d411Cb001d4C2"
};

interface PropertyData {
  id: string;
  name: string;
  total_shares: number;
  price_per_token: number;
  funding_goal_usdc: number;
  funding_deadline: string;
  status: string;
}

interface DeploymentResult {
  propertyId: string;
  contractAddress: string;
  transactionHash: string;
  gasUsed: string;
  deploymentTime: string;
}

async function main() {
  console.log("🚀 Starting PropertyShareToken deployment process...");
  
  // fix: validate environment variables (Cursor Rule 6)
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  // fix: initialize Supabase client with service role key (Cursor Rule 3)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log("📋 Fetching properties ready for token deployment...");
  
  // fix: fetch properties that are ready for token deployment from Supabase (Cursor Rule 4)
  const { data: properties, error: fetchError } = await supabase
    .from('properties')
    .select('id, name, total_shares, price_per_token, funding_goal_usdc, funding_deadline, status')
    .eq('status', 'active')
    .is('token_contract_address', null); // Only deploy for properties without existing token contracts

  if (fetchError) {
    throw new Error(`Failed to fetch properties: ${fetchError.message}`);
  }

  if (!properties || properties.length === 0) {
    console.log("ℹ️  No properties found that require token deployment");
    return;
  }

  console.log(`📊 Found ${properties.length} properties ready for token deployment`);

  const deployments: DeploymentResult[] = [];
  
  // fix: deploy token contract for each property (Cursor Rule 4)
  for (const property of properties) {
    console.log(`\n🏗️  Deploying token for property: ${property.name} (ID: ${property.id})`);
    
    try {
      const deployment = await deployPropertyToken(property);
      deployments.push(deployment);
      
      // fix: update Supabase with deployed contract address (Cursor Rule 4)
      await updatePropertyTokenAddress(supabase, property.id, deployment.contractAddress);
      
      console.log(`✅  Successfully deployed token for ${property.name}`);
      console.log(`   Contract Address: ${deployment.contractAddress}`);
      console.log(`   Transaction Hash: ${deployment.transactionHash}`);
      console.log(`   Gas Used: ${deployment.gasUsed}`);
      
    } catch (error) {
      console.error(`❌  Failed to deploy token for ${property.name}:`, error);
      // Continue with next property instead of failing entire deployment
    }
  }

  console.log(`\n🎉 Deployment complete! ${deployments.length} tokens deployed successfully`);
  
  // fix: log deployment summary for audit trail (Cursor Rule 4)
  console.table(deployments);
}

async function deployPropertyToken(property: PropertyData): Promise<DeploymentResult> {
  // fix: validate property data before deployment (Cursor Rule 6)
  if (!property.name || property.total_shares <= 0 || property.price_per_token <= 0) {
    throw new Error(`Invalid property data for ${property.name}`);
  }

  // fix: convert funding deadline to Unix timestamp (Cursor Rule 4)
  const fundingDeadline = Math.floor(new Date(property.funding_deadline).getTime() / 1000);
  
  if (fundingDeadline <= Math.floor(Date.now() / 1000)) {
    throw new Error(`Funding deadline has already passed for ${property.name}`);
  }

  // fix: generate token name and symbol based on property (Cursor Rule 4)
  const tokenName = `OpenHouse Property ${property.name}`;
  const tokenSymbol = `OH${property.id.slice(-3)}`; // Use last 3 chars of ID for symbol
  
  console.log(`📝  Token Details:`);
  console.log(`   Name: ${tokenName}`);
  console.log(`   Symbol: ${tokenSymbol}`);
  console.log(`   Total Shares: ${property.total_shares}`);
  console.log(`   Price per Token: ${property.price_per_token} USDC`);
  console.log(`   Funding Goal: ${property.funding_goal_usdc} USDC`);
  console.log(`   Funding Deadline: ${new Date(fundingDeadline * 1000).toISOString()}`);

  // fix: deploy PropertyShareToken with constructor arguments from Supabase (Cursor Rule 4)
  const PropertyShareTokenFactory = await ethers.getContractFactory("PropertyShareToken");
  
  const propertyToken = await PropertyShareTokenFactory.deploy(
    tokenName,
    tokenSymbol,
    parseInt(property.id), // Property ID as uint256
    property.total_shares,
    ethers.parseUnits(property.price_per_token.toString(), 6), // Convert to USDC wei (6 decimals)
    ethers.parseUnits(property.funding_goal_usdc.toString(), 6), // Convert to USDC wei
    fundingDeadline,
    WALLET_ADDRESSES.TREASURY,
    WALLET_ADDRESSES.OPERATOR
  );

  const deploymentReceipt = await propertyToken.deploymentTransaction()?.wait();
  
  if (!deploymentReceipt) {
    throw new Error("Failed to get deployment receipt");
  }

  return {
    propertyId: property.id,
    contractAddress: await propertyToken.getAddress(),
    transactionHash: deploymentReceipt.hash,
    gasUsed: deploymentReceipt.gasUsed.toString(),
    deploymentTime: new Date().toISOString()
  };
}

async function updatePropertyTokenAddress(supabase: any, propertyId: string, contractAddress: string) {
  // fix: update property record with deployed token contract address (Cursor Rule 4)
  const { error } = await supabase
    .from('properties')
    .update({ 
      token_contract_address: contractAddress,
      updated_at: new Date().toISOString()
    })
    .eq('id', propertyId);

  if (error) {
    console.warn(`⚠️  Failed to update property ${propertyId} with token address: ${error.message}`);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("💥 Deployment failed:", error);
  process.exitCode = 1;
}); 