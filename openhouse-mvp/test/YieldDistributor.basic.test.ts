import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("YieldDistributor Basic Tests", function () {
  let propertyToken: any;
  let yieldDistributor: any;
  let owner: any;
  let treasury: any;
  let operator: any;

  const TEST_PROPERTY = {
    name: "OpenHouse Property OH10",
    symbol: "OH10", 
    propertyId: 10,
    totalShares: 1000,
    pricePerToken: ethers.parseUnits("100", 6),
    fundingGoalUsdc: ethers.parseUnits("100000", 6),
    fundingDeadline: Math.floor(Date.now() / 1000) + 86400 * 30,
  };

  beforeEach(async function () {
    [owner, treasury, operator] = await ethers.getSigners();

    // Deploy PropertyShareToken first
    const PropertyShareTokenFactory = await ethers.getContractFactory("PropertyShareToken");
    propertyToken = await PropertyShareTokenFactory.deploy(
      TEST_PROPERTY.name,
      TEST_PROPERTY.symbol,
      TEST_PROPERTY.propertyId,
      TEST_PROPERTY.totalShares,
      TEST_PROPERTY.pricePerToken,
      TEST_PROPERTY.fundingGoalUsdc,
      TEST_PROPERTY.fundingDeadline,
      treasury.address,
      operator.address
    );

    // Use Base USDC address for testing
    const baseUsdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    // Deploy YieldDistributor
    const YieldDistributorFactory = await ethers.getContractFactory("YieldDistributor");
    yieldDistributor = await YieldDistributorFactory.deploy(
      TEST_PROPERTY.propertyId,
      await propertyToken.getAddress(),
      baseUsdcAddress,
      treasury.address,
      operator.address
    );
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await yieldDistributor.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should set correct property ID", async function () {
      expect(await yieldDistributor.propertyId()).to.equal(TEST_PROPERTY.propertyId);
    });

    it("Should set correct property token address", async function () {
      expect(await yieldDistributor.propertyToken()).to.equal(await propertyToken.getAddress());
    });

    it("Should set correct owner", async function () {
      expect(await yieldDistributor.owner()).to.equal(owner.address);
    });

    it("Should set correct treasury", async function () {
      expect(await yieldDistributor.treasury()).to.equal(treasury.address);
    });

    it("Should set correct operator", async function () {
      expect(await yieldDistributor.operator()).to.equal(operator.address);
    });

    it("Should initialize with zero distribution round", async function () {
      expect(await yieldDistributor.currentDistributionRound()).to.equal(0);
    });

    it("Should initialize with zero total distributed", async function () {
      expect(await yieldDistributor.totalDistributedUsdc()).to.equal(0);
    });
  });

  describe("Constructor Validation", function () {
    it("Should revert with zero property token address", async function () {
      const YieldDistributorFactory = await ethers.getContractFactory("YieldDistributor");
      
      await expect(
        YieldDistributorFactory.deploy(
          TEST_PROPERTY.propertyId,
          ethers.ZeroAddress,
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("YieldDistributor: property token address cannot be zero");
    });

    it("Should revert with zero USDC address", async function () {
      const YieldDistributorFactory = await ethers.getContractFactory("YieldDistributor");
      
      await expect(
        YieldDistributorFactory.deploy(
          TEST_PROPERTY.propertyId,
          await propertyToken.getAddress(),
          ethers.ZeroAddress,
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("YieldDistributor: USDC token address cannot be zero");
    });

    it("Should revert with zero treasury address", async function () {
      const YieldDistributorFactory = await ethers.getContractFactory("YieldDistributor");
      
      await expect(
        YieldDistributorFactory.deploy(
          TEST_PROPERTY.propertyId,
          await propertyToken.getAddress(),
          "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          ethers.ZeroAddress,
          operator.address
        )
      ).to.be.revertedWith("YieldDistributor: treasury address cannot be zero");
    });
  });
}); 