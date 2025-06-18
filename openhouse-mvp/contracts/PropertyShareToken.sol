// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PropertyShareToken
 * @dev ERC20 token representing fractional ownership of a real estate property
 * @notice Each property has its own token contract with fixed supply
 * @notice All parameters come from Supabase constructor arguments - no hardcoded values
 */
contract PropertyShareToken is ERC20, Ownable, ReentrancyGuard {
    
    // fix: property metadata passed from Supabase at deployment (Cursor Rule 4)
    uint256 public immutable propertyId;
    uint256 public immutable totalShares;
    uint256 public immutable pricePerToken;
    uint256 public immutable fundingGoalUsdc;
    uint256 public immutable fundingDeadline;
    
    // fix: role-based access control with predefined wallet addresses (Cursor Rule 3)
    address public immutable treasury;
    address public immutable operator;
    
    // fix: track minting status to prevent unauthorized token creation (Cursor Rule 4)
    bool public mintingCompleted;
    uint256 public totalMinted;
    
    // fix: events for transparent on-chain tracking (Cursor Rule 4)
    event TokensMinted(address indexed to, uint256 amount, uint256 totalMinted);
    event MintingCompleted(uint256 totalSupply, uint256 timestamp);
    event PropertyFunded(uint256 propertyId, uint256 totalAmount, uint256 timestamp);
    
    /**
     * @dev Constructor receives all property data from Supabase deployment script
     * @param _name Token name (e.g., "OpenHouse Property OH10")
     * @param _symbol Token symbol (e.g., "OH10")
     * @param _propertyId Property ID from Supabase properties table
     * @param _totalShares Total number of shares (matches properties.total_shares)
     * @param _pricePerToken Price per token in USDC wei (matches properties.price_per_token)
     * @param _fundingGoalUsdc Funding goal in USDC wei (matches properties.funding_goal_usdc)
     * @param _fundingDeadline Unix timestamp for funding deadline
     * @param _treasury Treasury wallet address for protocol operations
     * @param _operator Operator wallet address for administrative functions
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _propertyId,
        uint256 _totalShares,
        uint256 _pricePerToken,
        uint256 _fundingGoalUsdc,
        uint256 _fundingDeadline,
        address _treasury,
        address _operator
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        // fix: validate constructor parameters to prevent deployment errors (Cursor Rule 6)
        require(_totalShares > 0, "PropertyShareToken: total shares must be greater than zero");
        require(_pricePerToken > 0, "PropertyShareToken: price per token must be greater than zero");
        require(_fundingGoalUsdc > 0, "PropertyShareToken: funding goal must be greater than zero");
        require(_fundingDeadline > block.timestamp, "PropertyShareToken: funding deadline must be in the future");
        require(_treasury != address(0), "PropertyShareToken: treasury address cannot be zero");
        require(_operator != address(0), "PropertyShareToken: operator address cannot be zero");
        
        propertyId = _propertyId;
        totalShares = _totalShares;
        pricePerToken = _pricePerToken;
        fundingGoalUsdc = _fundingGoalUsdc;
        fundingDeadline = _fundingDeadline;
        treasury = _treasury;
        operator = _operator;
        
        mintingCompleted = false;
        totalMinted = 0;
    }
    
    /**
     * @dev Mint tokens to investor after successful USDC payment
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @notice Only owner can mint tokens, and only before minting is completed
     */
    function mintTo(address to, uint256 amount) external onlyOwner nonReentrant {
        require(!mintingCompleted, "PropertyShareToken: minting has been completed");
        require(to != address(0), "PropertyShareToken: cannot mint to zero address");
        require(amount > 0, "PropertyShareToken: amount must be greater than zero");
        require(totalMinted + amount <= totalShares, "PropertyShareToken: cannot mint more than total shares");
        
        _mint(to, amount);
        totalMinted += amount;
        
        emit TokensMinted(to, amount, totalMinted);
        
        // fix: automatically complete minting when all shares are allocated (Cursor Rule 4)
        if (totalMinted == totalShares) {
            mintingCompleted = true;
            emit MintingCompleted(totalSupply(), block.timestamp);
            emit PropertyFunded(propertyId, fundingGoalUsdc, block.timestamp);
        }
    }
    
    /**
     * @dev Complete minting process manually (for cases where not all shares are sold)
     * @notice Only owner can complete minting
     */
    function completeMinting() external onlyOwner {
        require(!mintingCompleted, "PropertyShareToken: minting already completed");
        
        mintingCompleted = true;
        emit MintingCompleted(totalSupply(), block.timestamp);
    }
    
    /**
     * @dev Get property information
     * @return _propertyId Property ID from Supabase
     * @return _totalShares Total shares for property
     * @return _pricePerToken Price per token in USDC wei
     * @return _fundingGoalUsdc Funding goal in USDC wei
     * @return _fundingDeadline Unix timestamp for funding deadline
     * @return _mintingCompleted Whether minting is completed
     * @return _totalMinted Total tokens minted so far
     */
    function getPropertyInfo() external view returns (
        uint256 _propertyId,
        uint256 _totalShares,
        uint256 _pricePerToken,
        uint256 _fundingGoalUsdc,
        uint256 _fundingDeadline,
        bool _mintingCompleted,
        uint256 _totalMinted
    ) {
        return (
            propertyId,
            totalShares,
            pricePerToken,
            fundingGoalUsdc,
            fundingDeadline,
            mintingCompleted,
            totalMinted
        );
    }
    
    /**
     * @dev Check if funding deadline has passed
     * @return true if deadline has passed
     */
    function isFundingExpired() external view returns (bool) {
        return block.timestamp > fundingDeadline;
    }
    
    /**
     * @dev Calculate funding progress percentage (basis points)
     * @return Funding progress in basis points (10000 = 100%)
     */
    function getFundingProgressBasisPoints() external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (totalMinted * 10000) / totalShares;
    }
} 