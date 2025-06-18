// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PropertyShareToken.sol";

/**
 * @title OrderBookExchange
 * @dev Permissionless on-chain order book for P2P trading of PropertyShareTokens
 * @notice Enables secondary trading with 0.5% fees charged to both buyer and seller
 * @notice All parameters come from Supabase constructor arguments - no hardcoded values
 */
contract OrderBookExchange is Ownable, ReentrancyGuard {
    
    // fix: property and token references passed from Supabase at deployment (Cursor Rule 4)
    uint256 public immutable propertyId;
    PropertyShareToken public immutable propertyToken;
    IERC20 public immutable usdcToken;
    
    // fix: role-based access control with predefined wallet addresses (Cursor Rule 3)
    address public immutable treasury;
    address public immutable operator;
    
    // fix: fee configuration with 0.5% default (Cursor Rule 4)
    uint256 public protocolFeeBasisPoints; // 50 = 0.5%
    uint256 public constant MAX_FEE_BASIS_POINTS = 500; // 5% maximum
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    
    // fix: order tracking for transparent P2P trading (Cursor Rule 4)
    uint256 public nextOrderId;
    uint256 public totalFeesCollected;
    
    // fix: order types for buy/sell operations (Cursor Rule 4)
    enum OrderType { BUY, SELL }
    enum OrderStatus { ACTIVE, FILLED, CANCELLED, PARTIAL }
    
    // fix: order data structure (Cursor Rule 4)
    struct Order {
        uint256 orderId;
        address creator;
        OrderType orderType;
        uint256 tokenAmount;
        uint256 pricePerToken; // In USDC wei (6 decimals)
        uint256 filledAmount;
        uint256 createdAt;
        OrderStatus status;
        bool isActive;
    }
    
    // fix: mappings for order book management (Cursor Rule 4)
    mapping(uint256 => Order) public orders;
    mapping(address => uint256[]) public userOrders;
    mapping(OrderType => uint256[]) public ordersByType;
    
    // fix: events for transparent on-chain tracking (Cursor Rule 4)
    event OrderCreated(
        uint256 indexed orderId,
        address indexed creator,
        OrderType indexed orderType,
        uint256 tokenAmount,
        uint256 pricePerToken,
        uint256 timestamp
    );
    
    event OrderFilled(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        uint256 tokenAmount,
        uint256 pricePerToken,
        uint256 buyerFee,
        uint256 sellerFee,
        uint256 timestamp
    );
    
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed creator,
        uint256 remainingAmount,
        uint256 timestamp
    );
    
    event OrderPartiallyFilled(
        uint256 indexed orderId,
        address indexed filler,
        uint256 filledAmount,
        uint256 remainingAmount,
        uint256 timestamp
    );
    
    event FeesWithdrawn(
        address indexed treasury,
        uint256 amount,
        uint256 timestamp
    );
    
    event ProtocolFeeUpdated(
        uint256 oldFeeBasisPoints,
        uint256 newFeeBasisPoints,
        uint256 timestamp
    );
    
    /**
     * @dev Constructor receives all property and token data from Supabase deployment script
     * @param _propertyId Property ID from Supabase properties table
     * @param _propertyTokenAddress Address of deployed PropertyShareToken for this property
     * @param _usdcTokenAddress Address of USDC token contract on Base
     * @param _treasury Treasury wallet address for protocol fee collection
     * @param _operator Operator wallet address for exchange operations
     * @param _protocolFeeBasisPoints Initial protocol fee in basis points (50 = 0.5%)
     */
    constructor(
        uint256 _propertyId,
        address _propertyTokenAddress,
        address _usdcTokenAddress,
        address _treasury,
        address _operator,
        uint256 _protocolFeeBasisPoints
    ) Ownable(msg.sender) {
        // fix: validate constructor parameters to prevent deployment errors (Cursor Rule 6)
        require(_propertyTokenAddress != address(0), "OrderBookExchange: property token address cannot be zero");
        require(_usdcTokenAddress != address(0), "OrderBookExchange: USDC token address cannot be zero");
        require(_treasury != address(0), "OrderBookExchange: treasury address cannot be zero");
        require(_operator != address(0), "OrderBookExchange: operator address cannot be zero");
        require(_protocolFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "OrderBookExchange: protocol fee too high");
        
        propertyId = _propertyId;
        propertyToken = PropertyShareToken(_propertyTokenAddress);
        usdcToken = IERC20(_usdcTokenAddress);
        treasury = _treasury;
        operator = _operator;
        protocolFeeBasisPoints = _protocolFeeBasisPoints;
        
        nextOrderId = 1;
        totalFeesCollected = 0;
    }
    
    /**
     * @dev Modifier to restrict access to owner or operator
     */
    modifier onlyOwnerOrOperator() {
        require(msg.sender == owner() || msg.sender == operator, "OrderBookExchange: caller is not owner or operator");
        _;
    }
    
    /**
     * @dev Create a buy order to purchase tokens with USDC
     * @param tokenAmount Amount of property tokens to buy
     * @param pricePerToken Price per token in USDC wei (6 decimals)
     * @notice Requires USDC approval for total order value + fees
     */
    function createBuyOrder(uint256 tokenAmount, uint256 pricePerToken) external nonReentrant {
        require(tokenAmount > 0, "OrderBookExchange: token amount must be greater than zero");
        require(pricePerToken > 0, "OrderBookExchange: price per token must be greater than zero");
        require(propertyToken.mintingCompleted(), "OrderBookExchange: property token minting not completed");
        
        // fix: calculate total USDC required including buyer fee (Cursor Rule 4)
        uint256 totalValue = (tokenAmount * pricePerToken) / 1e18; // Convert from 18 decimals to 6 decimals
        uint256 buyerFee = (totalValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
        uint256 totalRequired = totalValue + buyerFee;
        
        // fix: verify user has sufficient USDC and allowance (Cursor Rule 6)
        require(usdcToken.balanceOf(msg.sender) >= totalRequired, "OrderBookExchange: insufficient USDC balance");
        require(usdcToken.allowance(msg.sender, address(this)) >= totalRequired, "OrderBookExchange: insufficient USDC allowance");
        
        // fix: transfer USDC to escrow (Cursor Rule 4)
        require(usdcToken.transferFrom(msg.sender, address(this), totalRequired), "OrderBookExchange: USDC transfer failed");
        
        // fix: create and store buy order (Cursor Rule 4)
        _createOrder(OrderType.BUY, tokenAmount, pricePerToken);
    }
    
    /**
     * @dev Create a sell order to sell tokens for USDC
     * @param tokenAmount Amount of property tokens to sell
     * @param pricePerToken Price per token in USDC wei (6 decimals)
     * @notice Requires property token approval for the sell amount
     */
    function createSellOrder(uint256 tokenAmount, uint256 pricePerToken) external nonReentrant {
        require(tokenAmount > 0, "OrderBookExchange: token amount must be greater than zero");
        require(pricePerToken > 0, "OrderBookExchange: price per token must be greater than zero");
        require(propertyToken.mintingCompleted(), "OrderBookExchange: property token minting not completed");
        
        // fix: verify user has sufficient tokens and allowance (Cursor Rule 6)
        require(propertyToken.balanceOf(msg.sender) >= tokenAmount, "OrderBookExchange: insufficient token balance");
        require(propertyToken.allowance(msg.sender, address(this)) >= tokenAmount, "OrderBookExchange: insufficient token allowance");
        
        // fix: transfer tokens to escrow (Cursor Rule 4)
        require(propertyToken.transferFrom(msg.sender, address(this), tokenAmount), "OrderBookExchange: token transfer failed");
        
        // fix: create and store sell order (Cursor Rule 4)
        _createOrder(OrderType.SELL, tokenAmount, pricePerToken);
    }
    
    /**
     * @dev Internal function to create orders
     */
    function _createOrder(OrderType orderType, uint256 tokenAmount, uint256 pricePerToken) internal {
        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            orderId: orderId,
            creator: msg.sender,
            orderType: orderType,
            tokenAmount: tokenAmount,
            pricePerToken: pricePerToken,
            filledAmount: 0,
            createdAt: block.timestamp,
            status: OrderStatus.ACTIVE,
            isActive: true
        });
        
        userOrders[msg.sender].push(orderId);
        ordersByType[orderType].push(orderId);
        
        emit OrderCreated(orderId, msg.sender, orderType, tokenAmount, pricePerToken, block.timestamp);
    }
    
    /**
     * @dev Execute/fill an existing order (buy or sell)
     * @param orderId ID of the order to fill
     * @param fillAmount Amount of tokens to fill (can be partial)
     * @notice Automatically handles fee calculations and transfers
     */
    function executeOrder(uint256 orderId, uint256 fillAmount) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.isActive, "OrderBookExchange: order is not active");
        require(order.creator != msg.sender, "OrderBookExchange: cannot fill own order");
        require(fillAmount > 0, "OrderBookExchange: fill amount must be greater than zero");
        
        uint256 remainingAmount = order.tokenAmount - order.filledAmount;
        require(fillAmount <= remainingAmount, "OrderBookExchange: fill amount exceeds remaining order amount");
        
        // fix: calculate trade values and fees (Cursor Rule 4)
        uint256 tradeValue = (fillAmount * order.pricePerToken) / 1e18; // Convert from 18 decimals to 6 decimals
        uint256 buyerFee = (tradeValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
        uint256 sellerFee = (tradeValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
        
        if (order.orderType == OrderType.BUY) {
            _executeBuyOrder(order, fillAmount, tradeValue, buyerFee, sellerFee);
        } else {
            _executeSellOrder(order, fillAmount, tradeValue, buyerFee, sellerFee);
        }
        
        // fix: update order status (Cursor Rule 4)
        order.filledAmount += fillAmount;
        
        if (order.filledAmount >= order.tokenAmount) {
            order.status = OrderStatus.FILLED;
            order.isActive = false;
        } else {
            order.status = OrderStatus.PARTIAL;
            emit OrderPartiallyFilled(orderId, msg.sender, fillAmount, order.tokenAmount - order.filledAmount, block.timestamp);
        }
    }
    
    function _executeBuyOrder(Order storage order, uint256 fillAmount, uint256 tradeValue, uint256 buyerFee, uint256 sellerFee) internal {
        address buyer = order.creator;
        address seller = msg.sender;
        
        // fix: verify seller has sufficient tokens (Cursor Rule 6)
        require(propertyToken.balanceOf(seller) >= fillAmount, "OrderBookExchange: seller insufficient token balance");
        require(propertyToken.allowance(seller, address(this)) >= fillAmount, "OrderBookExchange: seller insufficient token allowance");
        
        // fix: transfer tokens from seller to buyer (Cursor Rule 4)
        require(propertyToken.transferFrom(seller, buyer, fillAmount), "OrderBookExchange: token transfer to buyer failed");
        
        // fix: transfer USDC from escrow to seller (minus seller fee) (Cursor Rule 4)
        uint256 sellerReceives = tradeValue - sellerFee;
        require(usdcToken.transfer(seller, sellerReceives), "OrderBookExchange: USDC transfer to seller failed");
        
        // fix: track protocol fees (Cursor Rule 4)
        totalFeesCollected += buyerFee + sellerFee;
        
        emit OrderFilled(order.orderId, buyer, seller, fillAmount, order.pricePerToken, buyerFee, sellerFee, block.timestamp);
    }
    
    function _executeSellOrder(Order storage order, uint256 fillAmount, uint256 tradeValue, uint256 buyerFee, uint256 sellerFee) internal {
        address seller = order.creator;
        address buyer = msg.sender;
        
        // fix: calculate total USDC required from buyer (Cursor Rule 4)
        uint256 totalRequired = tradeValue + buyerFee;
        
        // fix: verify buyer has sufficient USDC (Cursor Rule 6)
        require(usdcToken.balanceOf(buyer) >= totalRequired, "OrderBookExchange: buyer insufficient USDC balance");
        require(usdcToken.allowance(buyer, address(this)) >= totalRequired, "OrderBookExchange: buyer insufficient USDC allowance");
        
        // fix: transfer USDC from buyer (Cursor Rule 4)
        require(usdcToken.transferFrom(buyer, address(this), totalRequired), "OrderBookExchange: USDC transfer from buyer failed");
        
        // fix: transfer tokens from escrow to buyer (Cursor Rule 4)
        require(propertyToken.transfer(buyer, fillAmount), "OrderBookExchange: token transfer to buyer failed");
        
        // fix: transfer USDC to seller (minus seller fee) (Cursor Rule 4)
        uint256 sellerReceives = tradeValue - sellerFee;
        require(usdcToken.transfer(seller, sellerReceives), "OrderBookExchange: USDC transfer to seller failed");
        
        // fix: track protocol fees (Cursor Rule 4)
        totalFeesCollected += buyerFee + sellerFee;
        
        emit OrderFilled(order.orderId, buyer, seller, fillAmount, order.pricePerToken, buyerFee, sellerFee, block.timestamp);
    }
    
    /**
     * @dev Cancel an active order and return escrowed assets
     * @param orderId ID of the order to cancel
     * @notice Only order creator can cancel their own orders
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.creator == msg.sender, "OrderBookExchange: only order creator can cancel");
        require(order.isActive, "OrderBookExchange: order is not active");
        
        uint256 remainingAmount = order.tokenAmount - order.filledAmount;
        require(remainingAmount > 0, "OrderBookExchange: no remaining amount to cancel");
        
        // fix: return escrowed assets to order creator (Cursor Rule 4)
        if (order.orderType == OrderType.BUY) {
            // fix: return escrowed USDC for buy order (Cursor Rule 4)
            uint256 remainingValue = (remainingAmount * order.pricePerToken) / 1e18; // Convert from 18 decimals to 6 decimals
            uint256 remainingFee = (remainingValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
            uint256 totalToReturn = remainingValue + remainingFee;
            
            require(usdcToken.transfer(msg.sender, totalToReturn), "OrderBookExchange: USDC refund failed");
        } else {
            // fix: return escrowed tokens for sell order (Cursor Rule 4)
            require(propertyToken.transfer(msg.sender, remainingAmount), "OrderBookExchange: token refund failed");
        }
        
        // fix: mark order as cancelled (Cursor Rule 4)
        order.status = OrderStatus.CANCELLED;
        order.isActive = false;
        
        emit OrderCancelled(orderId, msg.sender, remainingAmount, block.timestamp);
    }
    
    /**
     * @dev Get order information by ID
     * @param orderId Order ID to query
     * @return _orderId Order ID
     * @return _creator Order creator address
     * @return _orderType Order type (BUY or SELL)
     * @return _tokenAmount Total token amount in order
     * @return _pricePerToken Price per token in USDC wei
     * @return _filledAmount Amount already filled
     * @return _createdAt Creation timestamp
     * @return _status Current order status
     * @return _isActive Whether order is active
     */
    function getOrder(uint256 orderId) external view returns (
        uint256 _orderId,
        address _creator,
        OrderType _orderType,
        uint256 _tokenAmount,
        uint256 _pricePerToken,
        uint256 _filledAmount,
        uint256 _createdAt,
        OrderStatus _status,
        bool _isActive
    ) {
        Order memory order = orders[orderId];
        return (
            order.orderId,
            order.creator,
            order.orderType,
            order.tokenAmount,
            order.pricePerToken,
            order.filledAmount,
            order.createdAt,
            order.status,
            order.isActive
        );
    }
    
    /**
     * @dev Get all order IDs for a specific user
     * @param user Address to query orders for
     * @return Array of order IDs created by the user
     */
    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }
    
    /**
     * @dev Get all order IDs for a specific order type
     * @param orderType Type of orders to query (BUY or SELL)
     * @return Array of order IDs of the specified type
     */
    function getOrdersByType(OrderType orderType) external view returns (uint256[] memory) {
        return ordersByType[orderType];
    }
    
    /**
     * @dev Get current protocol fee in basis points
     * @return Current protocol fee (50 = 0.5%)
     */
    function getProtocolFee() external view returns (uint256) {
        return protocolFeeBasisPoints;
    }
    
    /**
     * @dev Calculate fees for a given trade value
     * @param tradeValue Total value of the trade in USDC wei
     * @return buyerFee Fee charged to buyer
     * @return sellerFee Fee charged to seller
     * @return totalFees Combined fees
     */
    function calculateFees(uint256 tradeValue) external view returns (
        uint256 buyerFee,
        uint256 sellerFee,
        uint256 totalFees
    ) {
        buyerFee = (tradeValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
        sellerFee = (tradeValue * protocolFeeBasisPoints) / BASIS_POINTS_DIVISOR;
        totalFees = buyerFee + sellerFee;
    }
    
    /**
     * @dev Update protocol fee (admin only)
     * @param newFeeBasisPoints New fee in basis points (capped at MAX_FEE_BASIS_POINTS)
     * @notice Only owner can update protocol fees
     */
    function updateProtocolFee(uint256 newFeeBasisPoints) external onlyOwner {
        require(newFeeBasisPoints <= MAX_FEE_BASIS_POINTS, "OrderBookExchange: fee exceeds maximum");
        
        uint256 oldFee = protocolFeeBasisPoints;
        protocolFeeBasisPoints = newFeeBasisPoints;
        
        emit ProtocolFeeUpdated(oldFee, newFeeBasisPoints, block.timestamp);
    }
    
    /**
     * @dev Withdraw collected protocol fees to treasury (admin only)
     * @param amount Amount of USDC fees to withdraw
     * @notice Only owner can withdraw protocol fees
     */
    function withdrawProtocolFees(uint256 amount) external onlyOwner {
        require(amount > 0, "OrderBookExchange: amount must be greater than zero");
        require(amount <= totalFeesCollected, "OrderBookExchange: amount exceeds collected fees");
        require(usdcToken.balanceOf(address(this)) >= amount, "OrderBookExchange: insufficient contract balance");
        
        totalFeesCollected -= amount;
        require(usdcToken.transfer(treasury, amount), "OrderBookExchange: fee withdrawal failed");
        
        emit FeesWithdrawn(treasury, amount, block.timestamp);
    }
    
    /**
     * @dev Emergency function to withdraw all collected fees (admin only)
     * @notice Only for emergency situations or contract migration
     */
    function emergencyWithdrawAllFees() external onlyOwner {
        uint256 contractBalance = usdcToken.balanceOf(address(this));
        require(contractBalance > 0, "OrderBookExchange: no fees to withdraw");
        
        totalFeesCollected = 0;
        require(usdcToken.transfer(treasury, contractBalance), "OrderBookExchange: emergency withdrawal failed");
        
        emit FeesWithdrawn(treasury, contractBalance, block.timestamp);
    }
} 