const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OrderBookExchange", function () {
  let orderBookExchange;
  let propertyToken;
  let usdcToken;
  let owner, treasury, operator, user1, user2;

  const PROPERTY_ID = 1;
  const TOTAL_SUPPLY = ethers.parseEther("1000");
  const PROTOCOL_FEE_BASIS_POINTS = 50;
  
  beforeEach(async function () {
    [owner, treasury, operator, user1, user2] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdcToken.waitForDeployment();

    // Deploy PropertyShareToken
    const PropertyShareToken = await ethers.getContractFactory("PropertyShareToken");
    propertyToken = await PropertyShareToken.deploy(
      "Test Property Token",        // _name
      "TPT",                       // _symbol
      PROPERTY_ID,                 // _propertyId
      TOTAL_SUPPLY,                // _totalShares
      ethers.parseUnits("100", 6), // _pricePerToken (100 USDC)
      ethers.parseUnits("100000", 6), // _fundingGoalUsdc (100,000 USDC)
      Math.floor(Date.now() / 1000) + 86400, // _fundingDeadline (24 hours from now)
      await treasury.getAddress(), // _treasury
      await operator.getAddress() // _operator
    );
    await propertyToken.waitForDeployment();

    // Deploy OrderBookExchange
    const OrderBookExchange = await ethers.getContractFactory("OrderBookExchange");
    orderBookExchange = await OrderBookExchange.deploy(
      PROPERTY_ID,
      await propertyToken.getAddress(),
      await usdcToken.getAddress(),
      await treasury.getAddress(),
      await operator.getAddress(),
      PROTOCOL_FEE_BASIS_POINTS
    );
    await orderBookExchange.waitForDeployment();

    // Mint tokens for testing
    await propertyToken.connect(owner).mintTo(await user1.getAddress(), ethers.parseEther("100"));
    await propertyToken.connect(owner).mintTo(await user2.getAddress(), ethers.parseEther("100"));
    await propertyToken.connect(owner).completeMinting();

    // Mint USDC for testing
    const usdcAmount = ethers.parseUnits("10000", 6);
    await usdcToken.mint(await user1.getAddress(), usdcAmount);
    await usdcToken.mint(await user2.getAddress(), usdcAmount);
  });

  describe("Deployment", function () {
    it("Should set correct constructor parameters", async function () {
      expect(await orderBookExchange.propertyId()).to.equal(PROPERTY_ID);
      expect(await orderBookExchange.propertyToken()).to.equal(await propertyToken.getAddress());
      expect(await orderBookExchange.usdcToken()).to.equal(await usdcToken.getAddress());
      expect(await orderBookExchange.treasury()).to.equal(await treasury.getAddress());
      expect(await orderBookExchange.operator()).to.equal(await operator.getAddress());
      expect(await orderBookExchange.protocolFeeBasisPoints()).to.equal(PROTOCOL_FEE_BASIS_POINTS);
    });

    it("Should initialize with correct default values", async function () {
      expect(await orderBookExchange.nextOrderId()).to.equal(1);
      expect(await orderBookExchange.totalFeesCollected()).to.equal(0);
    });
  });

  describe("Buy Orders", function () {
    const tokenAmount = ethers.parseEther("1"); // 1 token instead of 10
    const pricePerToken = ethers.parseUnits("100", 6); // 100 USDC per token

    it("Should create buy order successfully", async function () {
      // Calculate required USDC
      const totalValue = (tokenAmount * pricePerToken) / ethers.parseEther("1");
      const buyerFee = (totalValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      const totalRequired = totalValue + buyerFee;
      
      await usdcToken.connect(user1).approve(await orderBookExchange.getAddress(), totalRequired);

      await expect(
        orderBookExchange.connect(user1).createBuyOrder(tokenAmount, pricePerToken)
      ).to.emit(orderBookExchange, "OrderCreated");

      const order = await orderBookExchange.getOrder(1);
      expect(order._orderId).to.equal(1);
      expect(order._creator).to.equal(await user1.getAddress());
      expect(order._orderType).to.equal(0);
      expect(order._isActive).to.be.true;
    });

    it("Should revert buy order with insufficient USDC balance", async function () {
      const largeAmount = ethers.parseEther("1000");
      await expect(
        orderBookExchange.connect(user1).createBuyOrder(largeAmount, pricePerToken)
      ).to.be.revertedWith("OrderBookExchange: insufficient USDC balance");
    });
  });

  describe("Sell Orders", function () {
    const tokenAmount = ethers.parseEther("1");
    const pricePerToken = ethers.parseUnits("100", 6);

    it("Should create sell order successfully", async function () {
      await propertyToken.connect(user1).approve(await orderBookExchange.getAddress(), tokenAmount);

      await expect(
        orderBookExchange.connect(user1).createSellOrder(tokenAmount, pricePerToken)
      ).to.emit(orderBookExchange, "OrderCreated");

      const order = await orderBookExchange.getOrder(1);
      expect(order._orderType).to.equal(1);
      expect(order._isActive).to.be.true;
    });

    it("Should revert sell order with insufficient token balance", async function () {
      const largeAmount = ethers.parseEther("1000");
      await expect(
        orderBookExchange.connect(user1).createSellOrder(largeAmount, pricePerToken)
      ).to.be.revertedWith("OrderBookExchange: insufficient token balance");
    });
  });

  describe("Order Execution", function () {
    const tokenAmount = ethers.parseEther("1");
    const pricePerToken = ethers.parseUnits("100", 6);

    it("Should execute buy order successfully", async function () {
      // Create buy order
      const totalValue = (tokenAmount * pricePerToken) / ethers.parseEther("1");
      const buyerFee = (totalValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      const totalRequired = totalValue + buyerFee;
      
      await usdcToken.connect(user1).approve(await orderBookExchange.getAddress(), totalRequired);
      await orderBookExchange.connect(user1).createBuyOrder(tokenAmount, pricePerToken);
      
      // Execute order
      await propertyToken.connect(user2).approve(await orderBookExchange.getAddress(), tokenAmount);
      
      await expect(
        orderBookExchange.connect(user2).executeOrder(1, tokenAmount)
      ).to.emit(orderBookExchange, "OrderFilled");

      const order = await orderBookExchange.getOrder(1);
      expect(order._filledAmount).to.equal(tokenAmount);
      expect(order._status).to.equal(1);
      expect(order._isActive).to.be.false;
    });

    it("Should collect protocol fees correctly", async function () {
      const totalValue = (tokenAmount * pricePerToken) / ethers.parseEther("1");
      const buyerFee = (totalValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      const totalRequired = totalValue + buyerFee;
      
      await usdcToken.connect(user1).approve(await orderBookExchange.getAddress(), totalRequired);
      await orderBookExchange.connect(user1).createBuyOrder(tokenAmount, pricePerToken);
      
      await propertyToken.connect(user2).approve(await orderBookExchange.getAddress(), tokenAmount);
      
      const initialFees = await orderBookExchange.totalFeesCollected();
      await orderBookExchange.connect(user2).executeOrder(1, tokenAmount);
      const finalFees = await orderBookExchange.totalFeesCollected();
      
      const expectedTotalFees = buyerFee * BigInt(2);
      expect(finalFees - initialFees).to.equal(expectedTotalFees);
    });
  });

  describe("Order Cancellation", function () {
    const tokenAmount = ethers.parseEther("1");
    const pricePerToken = ethers.parseUnits("100", 6);

    it("Should cancel buy order successfully", async function () {
      const totalValue = (tokenAmount * pricePerToken) / ethers.parseEther("1");
      const buyerFee = (totalValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      const totalRequired = totalValue + buyerFee;
      
      await usdcToken.connect(user1).approve(await orderBookExchange.getAddress(), totalRequired);
      await orderBookExchange.connect(user1).createBuyOrder(tokenAmount, pricePerToken);
      
      await expect(
        orderBookExchange.connect(user1).cancelOrder(1)
      ).to.emit(orderBookExchange, "OrderCancelled");
      
      const order = await orderBookExchange.getOrder(1);
      expect(order._status).to.equal(2);
      expect(order._isActive).to.be.false;
    });
  });

  describe("Fee Management", function () {
    it("Should update protocol fee (owner only)", async function () {
      const newFee = 100;
      
      await expect(
        orderBookExchange.connect(owner).updateProtocolFee(newFee)
      ).to.emit(orderBookExchange, "ProtocolFeeUpdated");
      
      expect(await orderBookExchange.protocolFeeBasisPoints()).to.equal(newFee);
    });

    it("Should withdraw protocol fees (owner only)", async function () {
      const tokenAmount = ethers.parseEther("1");
      const pricePerToken = ethers.parseUnits("100", 6);
      
      const totalValue = (tokenAmount * pricePerToken) / ethers.parseEther("1");
      const buyerFee = (totalValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      const totalRequired = totalValue + buyerFee;
      
      await usdcToken.connect(user1).approve(await orderBookExchange.getAddress(), totalRequired);
      await orderBookExchange.connect(user1).createBuyOrder(tokenAmount, pricePerToken);
      
      await propertyToken.connect(user2).approve(await orderBookExchange.getAddress(), tokenAmount);
      await orderBookExchange.connect(user2).executeOrder(1, tokenAmount);
      
      const feesCollected = await orderBookExchange.totalFeesCollected();
      
      await expect(
        orderBookExchange.connect(owner).withdrawProtocolFees(feesCollected)
      ).to.emit(orderBookExchange, "FeesWithdrawn");
      
      expect(await orderBookExchange.totalFeesCollected()).to.equal(0);
    });
  });

  describe("View Functions", function () {
    it("Should return correct fee calculations", async function () {
      const tradeValue = ethers.parseUnits("1000", 6);
      const [buyerFee, sellerFee, totalFees] = await orderBookExchange.calculateFees(tradeValue);
      
      const expectedFee = (tradeValue * BigInt(PROTOCOL_FEE_BASIS_POINTS)) / BigInt(10000);
      expect(buyerFee).to.equal(expectedFee);
      expect(sellerFee).to.equal(expectedFee);
      expect(totalFees).to.equal(expectedFee * BigInt(2));
    });

    it("Should return user orders", async function () {
      const tokenAmount = ethers.parseEther("1");
      const pricePerToken = ethers.parseUnits("100", 6);
      
      await propertyToken.connect(user1).approve(await orderBookExchange.getAddress(), tokenAmount);
      await orderBookExchange.connect(user1).createSellOrder(tokenAmount, pricePerToken);
      
      const userOrders = await orderBookExchange.getUserOrders(await user1.getAddress());
      expect(userOrders.length).to.equal(1);
      expect(Number(userOrders[0])).to.equal(1);
    });
  });
}); 