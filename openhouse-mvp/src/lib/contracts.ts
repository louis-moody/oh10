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
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// fix: contract addresses for Base networks (Cursor Rule 4)
export const CONTRACT_ADDRESSES = {
  USDC: {
    BASE_SEPOLIA: "0x036CbD53842c542668d858Cdf5Ff6eC9C2FcA5D7" as `0x${string}`,
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
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC || 
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
    console.error('Failed to fetch property token info:', error);
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
    console.error('Failed to fetch funding progress:', error);
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
    console.error('Failed to fetch user token balance:', error);
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
    console.error('Failed to fetch USDC info:', error);
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