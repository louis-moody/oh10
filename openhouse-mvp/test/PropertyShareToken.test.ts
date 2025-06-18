import { expect } from "chai";
import hre from "hardhat";
import { time as networkTime } from "@nomicfoundation/hardhat-network-helpers";
import { PropertyShareToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PropertyShareToken", function () {
  let propertyToken: PropertyShareToken;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let operator: SignerWithAddress;
  let investor1: SignerWithAddress;
  let investor2: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  // fix: test parameters matching OpenHouse property data structure (Cursor Rule 4)
  const TEST_PROPERTY = {
    name: "OpenHouse Property OH10",
    symbol: "OH10",
    propertyId: 10,
    totalShares: 1000,
    pricePerToken: hre.ethers.parseUnits("100", 6), // 100 USDC
    fundingGoalUsdc: hre.ethers.parseUnits("100000", 6), // 100,000 USDC
    fundingDeadline: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
  };

  beforeEach(async function () {
    [owner, treasury, operator, investor1, investor2, unauthorized] = await hre.ethers.getSigners();

    const PropertyShareTokenFactory = await hre.ethers.getContractFactory("PropertyShareToken");
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
  });

  describe("Deployment", function () {
    it("Should set the correct property metadata", async function () {
      expect(await propertyToken.name()).to.equal(TEST_PROPERTY.name);
      expect(await propertyToken.symbol()).to.equal(TEST_PROPERTY.symbol);
      expect(await propertyToken.propertyId()).to.equal(TEST_PROPERTY.propertyId);
      expect(await propertyToken.totalShares()).to.equal(TEST_PROPERTY.totalShares);
      expect(await propertyToken.pricePerToken()).to.equal(TEST_PROPERTY.pricePerToken);
      expect(await propertyToken.fundingGoalUsdc()).to.equal(TEST_PROPERTY.fundingGoalUsdc);
      expect(await propertyToken.fundingDeadline()).to.equal(TEST_PROPERTY.fundingDeadline);
    });

    it("Should set the correct role addresses", async function () {
      expect(await propertyToken.owner()).to.equal(owner.address);
      expect(await propertyToken.treasury()).to.equal(treasury.address);
      expect(await propertyToken.operator()).to.equal(operator.address);
    });

    it("Should initialize minting state correctly", async function () {
      expect(await propertyToken.mintingCompleted()).to.be.false;
      expect(await propertyToken.totalMinted()).to.equal(0);
      expect(await propertyToken.totalSupply()).to.equal(0);
    });

    it("Should revert deployment with invalid parameters", async function () {
      const PropertyShareTokenFactory = await hre.ethers.getContractFactory("PropertyShareToken");

      // Test zero total shares
      await expect(
        PropertyShareTokenFactory.deploy(
          TEST_PROPERTY.name,
          TEST_PROPERTY.symbol,
          TEST_PROPERTY.propertyId,
          0, // Invalid total shares
          TEST_PROPERTY.pricePerToken,
          TEST_PROPERTY.fundingGoalUsdc,
          TEST_PROPERTY.fundingDeadline,
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("PropertyShareToken: total shares must be greater than zero");

      // Test zero price per token
      await expect(
        PropertyShareTokenFactory.deploy(
          TEST_PROPERTY.name,
          TEST_PROPERTY.symbol,
          TEST_PROPERTY.propertyId,
          TEST_PROPERTY.totalShares,
          0, // Invalid price per token
          TEST_PROPERTY.fundingGoalUsdc,
          TEST_PROPERTY.fundingDeadline,
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("PropertyShareToken: price per token must be greater than zero");

      // Test past deadline
      await expect(
        PropertyShareTokenFactory.deploy(
          TEST_PROPERTY.name,
          TEST_PROPERTY.symbol,
          TEST_PROPERTY.propertyId,
          TEST_PROPERTY.totalShares,
          TEST_PROPERTY.pricePerToken,
          TEST_PROPERTY.fundingGoalUsdc,
          Math.floor(Date.now() / 1000) - 1, // Past deadline
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("PropertyShareToken: funding deadline must be in the future");

      // Test zero treasury address
      await expect(
        PropertyShareTokenFactory.deploy(
          TEST_PROPERTY.name,
          TEST_PROPERTY.symbol,
          TEST_PROPERTY.propertyId,
          TEST_PROPERTY.totalShares,
          TEST_PROPERTY.pricePerToken,
          TEST_PROPERTY.fundingGoalUsdc,
          TEST_PROPERTY.fundingDeadline,
          hre.ethers.ZeroAddress, // Invalid treasury address
          operator.address
        )
      ).to.be.revertedWith("PropertyShareToken: treasury address cannot be zero");
    });
  });

  describe("Minting", function () {
    it("Should mint tokens successfully", async function () {
      const mintAmount = 100;
      
      await expect(propertyToken.mintTo(investor1.address, mintAmount))
        .to.emit(propertyToken, "TokensMinted")
        .withArgs(investor1.address, mintAmount, mintAmount);

      expect(await propertyToken.balanceOf(investor1.address)).to.equal(mintAmount);
      expect(await propertyToken.totalMinted()).to.equal(mintAmount);
      expect(await propertyToken.totalSupply()).to.equal(mintAmount);
    });

    it("Should prevent unauthorized minting", async function () {
      await expect(
        propertyToken.connect(unauthorized).mintTo(investor1.address, 100)
      ).to.be.revertedWithCustomError(propertyToken, "OwnableUnauthorizedAccount");
    });

    it("Should prevent minting to zero address", async function () {
      await expect(
        propertyToken.mintTo(hre.ethers.ZeroAddress, 100)
      ).to.be.revertedWith("PropertyShareToken: cannot mint to zero address");
    });

    it("Should prevent minting zero amount", async function () {
      await expect(
        propertyToken.mintTo(investor1.address, 0)
      ).to.be.revertedWith("PropertyShareToken: amount must be greater than zero");
    });

    it("Should prevent minting more than total shares", async function () {
      await expect(
        propertyToken.mintTo(investor1.address, TEST_PROPERTY.totalShares + 1)
      ).to.be.revertedWith("PropertyShareToken: cannot mint more than total shares");
    });

    it("Should automatically complete minting when all shares are allocated", async function () {
      await expect(propertyToken.mintTo(investor1.address, TEST_PROPERTY.totalShares))
        .to.emit(propertyToken, "TokensMinted")
        .withArgs(investor1.address, TEST_PROPERTY.totalShares, TEST_PROPERTY.totalShares)
        .and.to.emit(propertyToken, "MintingCompleted")
        .and.to.emit(propertyToken, "PropertyFunded")
        .withArgs(TEST_PROPERTY.propertyId, TEST_PROPERTY.fundingGoalUsdc, await networkTime.latest());

      expect(await propertyToken.mintingCompleted()).to.be.true;
    });

    it("Should prevent minting after completion", async function () {
      await propertyToken.mintTo(investor1.address, TEST_PROPERTY.totalShares);
      
      await expect(
        propertyToken.mintTo(investor2.address, 1)
      ).to.be.revertedWith("PropertyShareToken: minting has been completed");
    });
  });

  describe("Manual Minting Completion", function () {
    it("Should allow owner to complete minting manually", async function () {
      await propertyToken.mintTo(investor1.address, 500); // Partial allocation
      
      await expect(propertyToken.completeMinting())
        .to.emit(propertyToken, "MintingCompleted");

      expect(await propertyToken.mintingCompleted()).to.be.true;
    });

    it("Should prevent completing minting twice", async function () {
      await propertyToken.completeMinting();
      
      await expect(propertyToken.completeMinting())
        .to.be.revertedWith("PropertyShareToken: minting already completed");
    });

    it("Should prevent unauthorized minting completion", async function () {
      await expect(
        propertyToken.connect(unauthorized).completeMinting()
      ).to.be.revertedWithCustomError(propertyToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return correct property information", async function () {
      const propertyInfo = await propertyToken.getPropertyInfo();
      
      expect(propertyInfo[0]).to.equal(TEST_PROPERTY.propertyId); // propertyId
      expect(propertyInfo[1]).to.equal(TEST_PROPERTY.totalShares); // totalShares
      expect(propertyInfo[2]).to.equal(TEST_PROPERTY.pricePerToken); // pricePerToken
      expect(propertyInfo[3]).to.equal(TEST_PROPERTY.fundingGoalUsdc); // fundingGoalUsdc
      expect(propertyInfo[4]).to.equal(TEST_PROPERTY.fundingDeadline); // fundingDeadline
      expect(propertyInfo[5]).to.be.false; // mintingCompleted
      expect(propertyInfo[6]).to.equal(0); // totalMinted
    });

    it("Should correctly report funding progress", async function () {
      expect(await propertyToken.getFundingProgressBasisPoints()).to.equal(0);
      
      await propertyToken.mintTo(investor1.address, 250); // 25% of shares
      expect(await propertyToken.getFundingProgressBasisPoints()).to.equal(2500); // 25% in basis points
      
      await propertyToken.mintTo(investor2.address, 750); // Complete funding
      expect(await propertyToken.getFundingProgressBasisPoints()).to.equal(10000); // 100% in basis points
    });

    it("Should correctly check funding expiration", async function () {
      expect(await propertyToken.isFundingExpired()).to.be.false;
      
      // Test with expired contract (need to deploy new one with past deadline for this test)
      const expiredDeadline = Math.floor(Date.now() / 1000) - 1;
      const PropertyShareTokenFactory = await ethers.getContractFactory("PropertyShareToken");
      
      // This deployment should fail due to past deadline validation
      await expect(
        PropertyShareTokenFactory.deploy(
          TEST_PROPERTY.name,
          TEST_PROPERTY.symbol,
          TEST_PROPERTY.propertyId,
          TEST_PROPERTY.totalShares,
          TEST_PROPERTY.pricePerToken,
          TEST_PROPERTY.fundingGoalUsdc,
          expiredDeadline,
          treasury.address,
          operator.address
        )
      ).to.be.revertedWith("PropertyShareToken: funding deadline must be in the future");
    });
  });

  describe("ERC20 Functionality", function () {
    beforeEach(async function () {
      await propertyToken.mintTo(investor1.address, 500);
      await propertyToken.mintTo(investor2.address, 300);
    });

    it("Should support standard ERC20 transfers", async function () {
      await expect(propertyToken.connect(investor1).transfer(investor2.address, 100))
        .to.emit(propertyToken, "Transfer")
        .withArgs(investor1.address, investor2.address, 100);

      expect(await propertyToken.balanceOf(investor1.address)).to.equal(400);
      expect(await propertyToken.balanceOf(investor2.address)).to.equal(400);
    });

    it("Should support ERC20 allowance mechanism", async function () {
      await propertyToken.connect(investor1).approve(investor2.address, 200);
      expect(await propertyToken.allowance(investor1.address, investor2.address)).to.equal(200);

      await propertyToken.connect(investor2).transferFrom(investor1.address, investor2.address, 150);
      expect(await propertyToken.balanceOf(investor1.address)).to.equal(350);
      expect(await propertyToken.balanceOf(investor2.address)).to.equal(450);
      expect(await propertyToken.allowance(investor1.address, investor2.address)).to.equal(50);
    });
  });
});

// Helper to get latest block timestamp (will be defined in hardhat helpers)
const time = {
  latest: async () => {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp;
  }
}; 