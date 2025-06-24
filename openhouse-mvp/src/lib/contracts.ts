import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// fix: PropertyShareToken ABI for frontend integration (Cursor Rule 4)
export const PROPERTY_SHARE_TOKEN_ABI = [
  {
    "inputs": [
      {"name": "_name", "type": "string"},
      {"name": "_symbol", "type": "string"},
      {"name": "_propertyId", "type": "uint256"},
      {"name": "_totalShares", "type": "uint256"},
      {"name": "_pricePerToken", "type": "uint256"},
      {"name": "_fundingGoalUsdc", "type": "uint256"},
      {"name": "_fundingDeadline", "type": "uint256"},
      {"name": "_treasury", "type": "address"},
      {"name": "_operator", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "totalSupply", "type": "uint256"},
      {"indexed": false, "name": "timestamp", "type": "uint256"}
    ],
    "name": "MintingCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "propertyId", "type": "uint256"},
      {"indexed": false, "name": "totalAmount", "type": "uint256"},
      {"indexed": false, "name": "timestamp", "type": "uint256"}
    ],
    "name": "PropertyFunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "totalMinted", "type": "uint256"}
    ],
    "name": "TokensMinted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "mintTo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "completeMinting",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getPropertyInfo",
    "outputs": [
      {"name": "_propertyId", "type": "uint256"},
      {"name": "_totalShares", "type": "uint256"},
      {"name": "_pricePerToken", "type": "uint256"},
      {"name": "_fundingGoalUsdc", "type": "uint256"},
      {"name": "_fundingDeadline", "type": "uint256"},
      {"name": "_mintingCompleted", "type": "bool"},
      {"name": "_totalMinted", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFundingProgressBasisPoints",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isFundingExpired",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "mintingCompleted",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalMinted",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "propertyId",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pricePerToken",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // fix: add ERC20 approve and allowance functions for trading (Cursor Rule 4)
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "owner", "type": "address"},
      {"indexed": true, "name": "spender", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Approval",
    "type": "event"
  }
] as const;

// fix: YieldDistributor ABI for yield distribution interactions (Cursor Rule 4)
export const YIELD_DISTRIBUTOR_ABI = [
  {
    "inputs": [
      {"name": "_propertyId", "type": "uint256"},
      {"name": "_propertyTokenAddress", "type": "address"},
      {"name": "_usdcTokenAddress", "type": "address"},
      {"name": "_treasury", "type": "address"},
      {"name": "_operator", "type": "address"},
      {"name": "_rentalWallet", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "distributionRound", "type": "uint256"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "timestamp", "type": "uint256"}
    ],
    "name": "YieldDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "distributionRound", "type": "uint256"},
      {"indexed": false, "name": "totalAmount", "type": "uint256"},
      {"indexed": false, "name": "yieldPerToken", "type": "uint256"},
      {"indexed": false, "name": "snapshotBlock", "type": "uint256"},
      {"indexed": false, "name": "eligibleTokens", "type": "uint256"}
    ],
    "name": "YieldDistributed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "user", "type": "address"},
      {"indexed": true, "name": "distributionRound", "type": "uint256"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "timestamp", "type": "uint256"}
    ],
    "name": "YieldClaimed",
    "type": "event"
  },
  {
    "inputs": [{"name": "amount", "type": "uint256"}],
    "name": "pullAndDistribute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "amount", "type": "uint256"}],
    "name": "depositYield",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "yieldAmount", "type": "uint256"}],
    "name": "distribute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "distributionRound", "type": "uint256"}],
    "name": "claimYield",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}, {"name": "distributionRound", "type": "uint256"}],
    "name": "getPendingYield",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getTotalPendingYield",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentDistributionRound",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalDistributedUsdc",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "distributionRound", "type": "uint256"}],
    "name": "getDistributionRound",
    "outputs": [
      {"name": "totalYieldUsdc", "type": "uint256"},
      {"name": "yieldPerToken", "type": "uint256"},
      {"name": "snapshotBlock", "type": "uint256"},
      {"name": "totalEligibleTokens", "type": "uint256"},
      {"name": "distributionTimestamp", "type": "uint256"},
      {"name": "distributionCompleted", "type": "bool"},
      {"name": "totalClaimedUsdc", "type": "uint256"},
      {"name": "claimsCount", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// fix: USDC contract ABI for payment interactions (Cursor Rule 4)
export const USDC_ABI = [
  {
    "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// fix: ERC20 ABI alias for consistency (Cursor Rule 4)
export const ERC20_ABI = USDC_ABI;

// fix: contract addresses for Base networks (Cursor Rule 4)
export const CONTRACT_ADDRESSES = {
  USDC: {
    BASE_SEPOLIA: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    BASE_MAINNET: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`
  }
} as const;

// fix: get correct USDC address based on chain (Cursor Rule 4)
export function getUsdcAddress(chainId: number): `0x${string}` | null {
  switch (chainId) {
    case baseSepolia.id:
      return CONTRACT_ADDRESSES.USDC.BASE_SEPOLIA;
    case base.id:
      return CONTRACT_ADDRESSES.USDC.BASE_MAINNET;
    default:
      return null;
  }
}

// fix: create public client for contract reads (Cursor Rule 4)
export function getPublicClient(chainId: number) {
  const chain = chainId === base.id ? base : baseSepolia;
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 
    (chainId === base.id ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
  
  return createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
}

// fix: helper functions for USDC amount formatting (Cursor Rule 4)
export function formatUsdcAmount(amount: bigint): string {
  return formatUnits(amount, 6); // USDC has 6 decimals
}

export function parseUsdcAmount(amount: string): bigint {
  return parseUnits(amount, 6); // USDC has 6 decimals
}

// fix: get operator address for USDC approvals from environment variable (Cursor Rule 4)
export function getOperatorAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS
  if (!address) {
    console.warn('NEXT_PUBLIC_OPERATOR_ADDRESS not configured')
    return null
  }
  
  if (!address.startsWith('0x')) {
    console.warn('NEXT_PUBLIC_OPERATOR_ADDRESS must be a valid hex address')
    return null
  }
  
  return address as `0x${string}`
}

// fix: get treasury address for fund destination (Cursor Rule 4)
export function getTreasuryAddress(): `0x${string}` | null {
  const treasuryAddress = process.env.NEXT_PUBLIC_TREASURY_ADDRESS
  if (!treasuryAddress) {
    console.warn('NEXT_PUBLIC_TREASURY_ADDRESS not configured')
    return null
  }
  return treasuryAddress as `0x${string}`
}

// fix: interface for property token information (Cursor Rule 4)
export interface PropertyTokenInfo {
  propertyId: bigint;
  totalShares: bigint;
  pricePerToken: bigint;
  fundingGoalUsdc: bigint;
  fundingDeadline: bigint;
  mintingCompleted: boolean;
  totalMinted: bigint;
}

// fix: interface for funding progress (Cursor Rule 4)
export interface FundingProgress {
  progressBasisPoints: bigint;
  progressPercentage: number;
  isExpired: boolean;
  remainingShares: bigint;
}

// fix: read property token information from contract (Cursor Rule 4)
export async function getPropertyTokenInfo(
  chainId: number,
  contractAddress: `0x${string}`
): Promise<PropertyTokenInfo | null> {
  try {
    const client = getPublicClient(chainId);
    
    const result = await client.readContract({
      address: contractAddress,
      abi: PROPERTY_SHARE_TOKEN_ABI,
      functionName: 'getPropertyInfo'
    });

    return {
      propertyId: result[0],
      totalShares: result[1],
      pricePerToken: result[2],
      fundingGoalUsdc: result[3],
      fundingDeadline: result[4],
      mintingCompleted: result[5],
      totalMinted: result[6]
    };
  } catch (error) {

    return null;
  }
}

// fix: read funding progress from contract (Cursor Rule 4)
export async function getFundingProgress(
  chainId: number,
  contractAddress: `0x${string}`
): Promise<FundingProgress | null> {
  try {
    const client = getPublicClient(chainId);
    
    const [progressBasisPoints, isExpired, tokenInfo] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: PROPERTY_SHARE_TOKEN_ABI,
        functionName: 'getFundingProgressBasisPoints'
      }),
      client.readContract({
        address: contractAddress,
        abi: PROPERTY_SHARE_TOKEN_ABI,
        functionName: 'isFundingExpired'
      }),
      getPropertyTokenInfo(chainId, contractAddress)
    ]);

    if (!tokenInfo) return null;

    return {
      progressBasisPoints,
      progressPercentage: Number(progressBasisPoints) / 100, // Convert basis points to percentage
      isExpired,
      remainingShares: tokenInfo.totalShares - tokenInfo.totalMinted
    };
  } catch (error) {

    return null;
  }
}

// fix: check user's token balance (Cursor Rule 4)
export async function getUserTokenBalance(
  chainId: number,
  contractAddress: `0x${string}`,
  userAddress: `0x${string}`
): Promise<bigint | null> {
  try {
    const client = getPublicClient(chainId);
    
    const balance = await client.readContract({
      address: contractAddress,
      abi: PROPERTY_SHARE_TOKEN_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    return balance;
  } catch (error) {

    return null;
  }
}

// fix: check user's USDC balance and allowance (Cursor Rule 4)
export async function getUserUsdcInfo(
  chainId: number,
  userAddress: `0x${string}`,
  spenderAddress?: `0x${string}`
): Promise<{balance: bigint; allowance: bigint} | null> {
  try {
    const usdcAddress = getUsdcAddress(chainId);
    if (!usdcAddress) return null;

    const client = getPublicClient(chainId);
    
    const balance = await client.readContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    let allowance = BigInt(0);
    if (spenderAddress) {
      allowance = await client.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [userAddress, spenderAddress]
      });
    }

    return { balance, allowance };
  } catch (error) {

    return null;
  }
}

// fix: calculate required USDC amount for token purchase (Cursor Rule 4)
export function calculateRequiredUsdc(tokenAmount: bigint, pricePerToken: bigint): bigint {
  return tokenAmount * pricePerToken;
}

// fix: validate token purchase parameters (Cursor Rule 6)
export function validateTokenPurchase(
  tokenAmount: bigint,
  pricePerToken: bigint,
  totalShares: bigint,
  totalMinted: bigint,
  userUsdcBalance: bigint,
  userUsdcAllowance: bigint,
  mintingCompleted: boolean,
  isFundingExpired: boolean
): {valid: boolean; error?: string} {
  if (mintingCompleted) {
    return {valid: false, error: "Minting has been completed for this property"};
  }

  if (isFundingExpired) {
    return {valid: false, error: "Funding deadline has expired"};
  }

  if (tokenAmount <= 0) {
    return {valid: false, error: "Token amount must be greater than zero"};
  }

  if (totalMinted + tokenAmount > totalShares) {
    return {valid: false, error: "Not enough tokens remaining"};
  }

  const requiredUsdc = calculateRequiredUsdc(tokenAmount, pricePerToken);

  if (userUsdcBalance < requiredUsdc) {
    return {valid: false, error: "Insufficient USDC balance"};
  }

  if (userUsdcAllowance < requiredUsdc) {
    return {valid: false, error: "Insufficient USDC allowance - please approve first"};
  }

  return {valid: true};
}

// fix: YieldDistributor utility functions (Cursor Rule 4)

export interface YieldDistributionInfo {
  currentRound: bigint;
  totalDistributed: bigint;
  userPendingYield: bigint;
}

export interface DistributionRoundInfo {
  totalYieldUsdc: bigint;
  yieldPerToken: bigint;
  snapshotBlock: bigint;
  totalEligibleTokens: bigint;
  distributionTimestamp: bigint;
  distributionCompleted: boolean;
  totalClaimedUsdc: bigint;
  claimsCount: bigint;
}

export async function getYieldDistributionInfo(
  chainId: number,
  contractAddress: `0x${string}`,
  userAddress: `0x${string}`
): Promise<YieldDistributionInfo | null> {
  const client = getPublicClient(chainId);
  if (!client) return null;

  try {
    const [currentRound, totalDistributed, userPendingYield] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'currentDistributionRound',
      }),
      client.readContract({
        address: contractAddress,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'totalDistributedUsdc',
      }),
      client.readContract({
        address: contractAddress,
        abi: YIELD_DISTRIBUTOR_ABI,
        functionName: 'getTotalPendingYield',
        args: [userAddress],
      }),
    ]);

    return {
      currentRound: currentRound as bigint,
      totalDistributed: totalDistributed as bigint,
      userPendingYield: userPendingYield as bigint,
    };
  } catch (error) {

    return null;
  }
}

export async function getDistributionRoundInfo(
  chainId: number,
  contractAddress: `0x${string}`,
  roundNumber: bigint
): Promise<DistributionRoundInfo | null> {
  const client = getPublicClient(chainId);
  if (!client) return null;

  try {
    const roundInfo = await client.readContract({
      address: contractAddress,
      abi: YIELD_DISTRIBUTOR_ABI,
      functionName: 'getDistributionRound',
      args: [roundNumber],
    }) as [bigint, bigint, bigint, bigint, bigint, boolean, bigint, bigint];

    return {
      totalYieldUsdc: roundInfo[0],
      yieldPerToken: roundInfo[1],
      snapshotBlock: roundInfo[2],
      totalEligibleTokens: roundInfo[3],
      distributionTimestamp: roundInfo[4],
      distributionCompleted: roundInfo[5],
      totalClaimedUsdc: roundInfo[6],
      claimsCount: roundInfo[7],
    };
  } catch (error) {

    return null;
  }
}

export async function getUserPendingYieldForRound(
  chainId: number,
  contractAddress: `0x${string}`,
  userAddress: `0x${string}`,
  roundNumber: bigint
): Promise<bigint | null> {
  const client = getPublicClient(chainId);
  if (!client) return null;

  try {
    const pendingYield = await client.readContract({
      address: contractAddress,
      abi: YIELD_DISTRIBUTOR_ABI,
      functionName: 'getPendingYield',
      args: [userAddress, roundNumber],
    });

    return pendingYield as bigint;
  } catch (error) {

    return null;
  }
}



// fix: OrderBookExchange ABI in JSON format for Wagmi (Cursor Rule 4)
export const OrderBookExchangeABI = [
  {
    "type": "function",
    "name": "propertyId",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "propertyToken",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdcToken",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "operator",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "address"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBasisPoints",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextOrderId",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalFeesCollected",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createBuyOrder",
    "inputs": [
      {"name": "tokenAmount", "type": "uint256", "internalType": "uint256"},
      {"name": "pricePerToken", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createSellOrder",
    "inputs": [
      {"name": "tokenAmount", "type": "uint256", "internalType": "uint256"},
      {"name": "pricePerToken", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeOrder",
    "inputs": [
      {"name": "orderId", "type": "uint256", "internalType": "uint256"},
      {"name": "fillAmount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelOrder",
    "inputs": [
      {"name": "orderId", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getOrder",
    "inputs": [
      {"name": "orderId", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "address", "internalType": "address"},
      {"name": "", "type": "uint8", "internalType": "uint8"},
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint8", "internalType": "uint8"},
      {"name": "", "type": "bool", "internalType": "bool"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUserOrders",
    "inputs": [
      {"name": "user", "type": "address", "internalType": "address"}
    ],
    "outputs": [
      {"name": "", "type": "uint256[]", "internalType": "uint256[]"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOrdersByType",
    "inputs": [
      {"name": "orderType", "type": "uint8", "internalType": "uint8"}
    ],
    "outputs": [
      {"name": "", "type": "uint256[]", "internalType": "uint256[]"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "calculateFees",
    "inputs": [
      {"name": "tradeValue", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint256", "internalType": "uint256"},
      {"name": "", "type": "uint256", "internalType": "uint256"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updateProtocolFee",
    "inputs": [
      {"name": "newFeeBasisPoints", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawProtocolFees",
    "inputs": [
      {"name": "amount", "type": "uint256", "internalType": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "emergencyWithdrawAllFees",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

// fix: USDC token ABI for Base network (Cursor Rule 4)
export const USDCABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
] as const;



// fix: order types for OrderBookExchange (Cursor Rule 4)
export const OrderType = {
  BUY: 0,
  SELL: 1
} as const;

// fix: order status for OrderBookExchange (Cursor Rule 4)
export const OrderStatus = {
  ACTIVE: 0,
  FILLED: 1,
  CANCELLED: 2,
  PARTIAL: 3
} as const;

// fix: utility functions for contract interactions (Cursor Rule 4)
export const ContractUtils = {
  // Calculate total USDC required for buy order including fees
  calculateBuyOrderTotal: (tokenAmount: bigint, pricePerToken: bigint, protocolFeeBasisPoints: bigint): bigint => {
    const totalValue = (tokenAmount * pricePerToken) / BigInt(1e18);
    const buyerFee = (totalValue * protocolFeeBasisPoints) / BigInt(10000);
    return totalValue + buyerFee;
  },

  // Calculate fees for a trade value
  calculateTradeFees: (tradeValue: bigint, protocolFeeBasisPoints: bigint): { buyerFee: bigint; sellerFee: bigint; totalFees: bigint } => {
    const buyerFee = (tradeValue * protocolFeeBasisPoints) / BigInt(10000);
    const sellerFee = (tradeValue * protocolFeeBasisPoints) / BigInt(10000);
    return {
      buyerFee,
      sellerFee,
      totalFees: buyerFee + sellerFee
    };
  },

  // Convert order type enum to string
  orderTypeToString: (orderType: number): string => {
    return orderType === OrderType.BUY ? "BUY" : "SELL";
  },

  // Convert order status enum to string
  orderStatusToString: (status: number): string => {
    switch (status) {
      case OrderStatus.ACTIVE: return "ACTIVE";
      case OrderStatus.FILLED: return "FILLED";
      case OrderStatus.CANCELLED: return "CANCELLED";
      case OrderStatus.PARTIAL: return "PARTIAL";
      default: return "UNKNOWN";
    }
  },

  // Format USDC amount for display (6 decimals)
  formatUSDC: (amount: bigint): string => {
    return (Number(amount) / 1e6).toFixed(2);
  },

  // Format token amount for display (18 decimals)
  formatTokens: (amount: bigint): string => {
    return (Number(amount) / 1e18).toFixed(6);
  },

  // Parse USDC input to wei (6 decimals)
  parseUSDC: (amount: string): bigint => {
    return BigInt(Math.floor(parseFloat(amount) * 1e6));
  },

  // Parse token input to wei (18 decimals)
  parseTokens: (amount: string): bigint => {
    return BigInt(Math.floor(parseFloat(amount) * 1e18));
  }
};

 