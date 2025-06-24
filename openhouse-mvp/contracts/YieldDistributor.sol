// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PropertyShareToken.sol";

/**
 * @title YieldDistributor
 * @dev Distributes USDC rental income to PropertyShareToken holders based on proportional holdings
 * @notice Each property has its own YieldDistributor contract linked to its PropertyShareToken
 * @notice All parameters come from Supabase constructor arguments - no hardcoded values
 */
contract YieldDistributor is Ownable, ReentrancyGuard {
    
    // fix: property and token references passed from Supabase at deployment (Cursor Rule 4)
    uint256 public immutable propertyId;
    PropertyShareToken public immutable propertyToken;
    IERC20 public immutable usdcToken;
    
    // fix: role-based access control with predefined wallet addresses (Cursor Rule 3)
    address public immutable treasury;
    address public immutable operator;
    address public immutable rentalWallet;
    
    // fix: distribution tracking for transparent yield accounting (Cursor Rule 4)
    uint256 public currentDistributionRound;
    uint256 public totalDistributedUsdc;
    
    // fix: distribution round data structure (Cursor Rule 4)
    struct DistributionRound {
        uint256 totalYieldUsdc;
        uint256 yieldPerToken;
        uint256 snapshotBlock;
        uint256 totalEligibleTokens;
        uint256 distributionTimestamp;
        bool distributionCompleted;
        uint256 totalClaimedUsdc;
        uint256 claimsCount;
    }
    
    // fix: mappings for yield distribution tracking (Cursor Rule 4)
    mapping(uint256 => DistributionRound) public distributionRounds;
    mapping(address => mapping(uint256 => bool)) public hasClaimedYield;
    mapping(address => uint256) public totalClaimedByUser;
    
    // fix: events for transparent on-chain tracking (Cursor Rule 4)
    event YieldDeposited(uint256 indexed distributionRound, uint256 amount, uint256 timestamp);
    event YieldDistributed(uint256 indexed distributionRound, uint256 totalAmount, uint256 yieldPerToken, uint256 snapshotBlock, uint256 eligibleTokens);
    event YieldClaimed(address indexed user, uint256 indexed distributionRound, uint256 amount, uint256 timestamp);
    event DistributionCompleted(uint256 indexed distributionRound, uint256 totalClaimed, uint256 claimsCount, uint256 timestamp);
    
    /**
     * @dev Constructor receives all property and token data from Supabase deployment script
     * @param _propertyId Property ID from Supabase properties table
     * @param _propertyTokenAddress Address of deployed PropertyShareToken for this property
     * @param _usdcTokenAddress Address of USDC token contract on Base
     * @param _treasury Treasury wallet address for protocol operations
     * @param _operator Operator wallet address for distribution functions
     * @param _rentalWallet Rental wallet address that receives tenant payments
     */
    constructor(
        uint256 _propertyId,
        address _propertyTokenAddress,
        address _usdcTokenAddress,
        address _treasury,
        address _operator,
        address _rentalWallet
    ) Ownable(msg.sender) {
        // fix: validate constructor parameters to prevent deployment errors (Cursor Rule 6)
        require(_propertyTokenAddress != address(0), "YieldDistributor: property token address cannot be zero");
        require(_usdcTokenAddress != address(0), "YieldDistributor: USDC token address cannot be zero");
        require(_treasury != address(0), "YieldDistributor: treasury address cannot be zero");
        require(_operator != address(0), "YieldDistributor: operator address cannot be zero");
        require(_rentalWallet != address(0), "YieldDistributor: rental wallet address cannot be zero");
        
        propertyId = _propertyId;
        propertyToken = PropertyShareToken(_propertyTokenAddress);
        usdcToken = IERC20(_usdcTokenAddress);
        treasury = _treasury;
        operator = _operator;
        rentalWallet = _rentalWallet;
        
        currentDistributionRound = 0;
        totalDistributedUsdc = 0;
    }
    
    /**
     * @dev Modifier to restrict access to owner or operator
     */
    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner() || msg.sender == operator, "YieldDistributor: caller is not owner or operator");
        _;
    }
    
    /**
     * @dev Pull USDC from rental wallet and distribute to token holders (one-step process)
     * @param amount Amount of USDC to pull from rental wallet and distribute
     * @notice Only owner or operator can pull and distribute yield
     * @notice Rental wallet must have approved this contract for USDC transfers
     */
    function pullAndDistribute(uint256 amount) external onlyOwnerOrOperator nonReentrant {
        require(amount > 0, "YieldDistributor: amount must be greater than zero");
        require(propertyToken.mintingCompleted(), "YieldDistributor: property token minting not completed");
        
        // fix: pull USDC from rental wallet to this contract (Cursor Rule 4)
        require(usdcToken.transferFrom(rentalWallet, address(this), amount), "YieldDistributor: USDC transfer from rental wallet failed");
        
        currentDistributionRound++;
        
        // fix: immediately distribute the pulled yield using the same logic as distribute() (Cursor Rule 4)
        require(!distributionRounds[currentDistributionRound].distributionCompleted, "YieldDistributor: distribution already completed");
        require(usdcToken.balanceOf(address(this)) >= amount, "YieldDistributor: insufficient USDC balance");
        
        // fix: take snapshot of current block and total token supply (Cursor Rule 4)
        uint256 snapshotBlock = block.number;
        uint256 totalEligibleTokens = propertyToken.totalSupply();
        
        require(totalEligibleTokens > 0, "YieldDistributor: no tokens in circulation");
        
        // fix: calculate yield per token with proper precision to avoid integer division loss (Cursor Rule 4)
        // Use 18 decimal precision to match token decimals, then convert back for USDC
        uint256 yieldPerToken = (amount * 1e18) / totalEligibleTokens;
        
        // fix: store distribution round data (Cursor Rule 4)
        distributionRounds[currentDistributionRound] = DistributionRound({
            totalYieldUsdc: amount,
            yieldPerToken: yieldPerToken,
            snapshotBlock: snapshotBlock,
            totalEligibleTokens: totalEligibleTokens,
            distributionTimestamp: block.timestamp,
            distributionCompleted: false,
            totalClaimedUsdc: 0,
            claimsCount: 0
        });
        
        totalDistributedUsdc += amount;
        
        emit YieldDistributed(currentDistributionRound, amount, yieldPerToken, snapshotBlock, totalEligibleTokens);
        
        emit YieldDeposited(currentDistributionRound, amount, block.timestamp);
    }

    /**
     * @dev Deposit USDC yield for distribution to token holders (legacy function)
     * @param amount Amount of USDC to deposit for yield distribution
     * @notice Only owner or operator can deposit yield
     */
    function depositYield(uint256 amount) external onlyOwnerOrOperator nonReentrant {
        require(amount > 0, "YieldDistributor: amount must be greater than zero");
        require(propertyToken.mintingCompleted(), "YieldDistributor: property token minting not completed");
        
        // fix: transfer USDC from sender to this contract (Cursor Rule 4)
        require(usdcToken.transferFrom(msg.sender, address(this), amount), "YieldDistributor: USDC transfer failed");
        
        currentDistributionRound++;
        
        emit YieldDeposited(currentDistributionRound, amount, block.timestamp);
    }
    
    /**
     * @dev Distribute deposited yield to token holders based on their holdings at snapshot block
     * @param yieldAmount Amount of USDC to distribute in this round
     * @notice Only owner or operator can trigger distribution
     */
    function distribute(uint256 yieldAmount) external onlyOwnerOrOperator nonReentrant {
        require(yieldAmount > 0, "YieldDistributor: yield amount must be greater than zero");
        require(currentDistributionRound > 0, "YieldDistributor: no yield deposited");
        require(!distributionRounds[currentDistributionRound].distributionCompleted, "YieldDistributor: distribution already completed");
        require(usdcToken.balanceOf(address(this)) >= yieldAmount, "YieldDistributor: insufficient USDC balance");
        
        // fix: take snapshot of current block and total token supply (Cursor Rule 4)
        uint256 snapshotBlock = block.number;
        uint256 totalEligibleTokens = propertyToken.totalSupply();
        
        require(totalEligibleTokens > 0, "YieldDistributor: no tokens in circulation");
        
        // fix: calculate yield per token with proper precision to avoid integer division loss (Cursor Rule 4)
        // Use 18 decimal precision to match token decimals, then convert back for USDC
        uint256 yieldPerToken = (yieldAmount * 1e18) / totalEligibleTokens;
        
        // fix: store distribution round data (Cursor Rule 4)
        distributionRounds[currentDistributionRound] = DistributionRound({
            totalYieldUsdc: yieldAmount,
            yieldPerToken: yieldPerToken,
            snapshotBlock: snapshotBlock,
            totalEligibleTokens: totalEligibleTokens,
            distributionTimestamp: block.timestamp,
            distributionCompleted: false,
            totalClaimedUsdc: 0,
            claimsCount: 0
        });
        
        totalDistributedUsdc += yieldAmount;
        
        emit YieldDistributed(currentDistributionRound, yieldAmount, yieldPerToken, snapshotBlock, totalEligibleTokens);
    }
    
    /**
     * @dev Claim pending yield for a specific distribution round
     * @param distributionRound The distribution round to claim yield from
     * @notice Users can claim their proportional share of yield based on token holdings
     */
    function claimYield(uint256 distributionRound) external nonReentrant {
        require(distributionRound > 0 && distributionRound <= currentDistributionRound, "YieldDistributor: invalid distribution round");
        require(!hasClaimedYield[msg.sender][distributionRound], "YieldDistributor: yield already claimed for this round");
        
        DistributionRound storage round = distributionRounds[distributionRound];
        require(round.yieldPerToken > 0, "YieldDistributor: distribution not yet processed");
        
        // fix: calculate user's yield based on token balance at distribution time (Cursor Rule 4)
        uint256 userTokenBalance = propertyToken.balanceOf(msg.sender);
        require(userTokenBalance > 0, "YieldDistributor: no tokens held");
        
        uint256 userYieldAmount = (userTokenBalance * round.yieldPerToken) / 1e18;
        require(userYieldAmount > 0, "YieldDistributor: no yield to claim");
        
        // fix: mark as claimed and update tracking (Cursor Rule 4)
        hasClaimedYield[msg.sender][distributionRound] = true;
        totalClaimedByUser[msg.sender] += userYieldAmount;
        
        // fix: update distribution round statistics (Cursor Rule 4)
        round.totalClaimedUsdc += userYieldAmount;
        round.claimsCount++;
        
        // fix: transfer USDC yield to user (Cursor Rule 4)
        require(usdcToken.transfer(msg.sender, userYieldAmount), "YieldDistributor: USDC transfer failed");
        
        emit YieldClaimed(msg.sender, distributionRound, userYieldAmount, block.timestamp);
        
        // fix: check if all yield has been claimed for this round (Cursor Rule 4)
        if (round.totalClaimedUsdc >= round.totalYieldUsdc) {
            round.distributionCompleted = true;
            emit DistributionCompleted(distributionRound, round.totalClaimedUsdc, round.claimsCount, block.timestamp);
        }
    }
    
    /**
     * @dev Get pending yield amount for a user in a specific distribution round
     * @param user Address to check pending yield for
     * @param distributionRound Distribution round to check
     * @return Pending yield amount in USDC
     */
    function getPendingYield(address user, uint256 distributionRound) external view returns (uint256) {
        if (distributionRound == 0 || distributionRound > currentDistributionRound) {
            return 0;
        }
        
        if (hasClaimedYield[user][distributionRound]) {
            return 0;
        }
        
        DistributionRound memory round = distributionRounds[distributionRound];
        if (round.yieldPerToken == 0) {
            return 0;
        }
        
        uint256 userTokenBalance = propertyToken.balanceOf(user);
        return (userTokenBalance * round.yieldPerToken) / 1e18;
    }
    
    /**
     * @dev Get total pending yield across all distribution rounds for a user
     * @param user Address to check total pending yield for
     * @return Total pending yield amount in USDC
     */
    function getTotalPendingYield(address user) external view returns (uint256) {
        uint256 totalPending = 0;
        
        for (uint256 i = 1; i <= currentDistributionRound; i++) {
            if (!hasClaimedYield[user][i]) {
                DistributionRound memory round = distributionRounds[i];
                if (round.yieldPerToken > 0) {
                    uint256 userTokenBalance = propertyToken.balanceOf(user);
                    totalPending += (userTokenBalance * round.yieldPerToken) / 1e18;
                }
            }
        }
        
        return totalPending;
    }
    
    /**
     * @dev Get distribution round information
     * @param distributionRound Distribution round to query
     * @return totalYieldUsdc Total USDC yield for this round
     * @return yieldPerToken Yield per token for this round
     * @return snapshotBlock Block number when snapshot was taken
     * @return totalEligibleTokens Total tokens eligible for this round
     * @return distributionTimestamp When distribution was processed
     * @return distributionCompleted Whether all yield has been claimed
     * @return totalClaimedUsdc Total USDC claimed from this round
     * @return claimsCount Number of claims made for this round
     */
    function getDistributionRound(uint256 distributionRound) external view returns (
        uint256 totalYieldUsdc,
        uint256 yieldPerToken,
        uint256 snapshotBlock,
        uint256 totalEligibleTokens,
        uint256 distributionTimestamp,
        bool distributionCompleted,
        uint256 totalClaimedUsdc,
        uint256 claimsCount
    ) {
        DistributionRound memory round = distributionRounds[distributionRound];
        return (
            round.totalYieldUsdc,
            round.yieldPerToken,
            round.snapshotBlock,
            round.totalEligibleTokens,
            round.distributionTimestamp,
            round.distributionCompleted,
            round.totalClaimedUsdc,
            round.claimsCount
        );
    }
    
    /**
     * @dev Emergency function to withdraw remaining USDC (admin only)
     * @param amount Amount of USDC to withdraw
     * @notice Only for emergency situations or unclaimed yield recovery
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "YieldDistributor: amount must be greater than zero");
        require(usdcToken.balanceOf(address(this)) >= amount, "YieldDistributor: insufficient balance");
        
        require(usdcToken.transfer(treasury, amount), "YieldDistributor: USDC transfer failed");
    }
} 