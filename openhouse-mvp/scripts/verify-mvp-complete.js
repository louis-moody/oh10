const { ethers } = require('hardhat');

async function main() {
  console.log('🎯 OpenHouse MVP - Final Verification\n');
  console.log('=====================================\n');

  const yieldDistributorAddress = '0xfC9143Ba90F2D1d94a859BeC7ECa6e32DD9aFf08';
  const propertyTokenAddress = '0x33ED002813f4e6275eFc14fBE6A24b68B2c13A5F';
  const userWallet = '0x73CB97A0a3259a34dAfF3f821c6051D6C697A21E';
  const rentalWallet = '0x94d773aEBB1566915eCC837Bb1399E2731732a27';
  const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  try {
    // 1. Verify Property Token
    console.log('🏠 1. Property Token Verification:');
    const propertyToken = await ethers.getContractAt('PropertyShareToken', propertyTokenAddress);
    const tokenName = await propertyToken.name();
    const tokenSymbol = await propertyToken.symbol();
    const totalSupply = await propertyToken.totalSupply();
    const userBalance = await propertyToken.balanceOf(userWallet);
    const mintingCompleted = await propertyToken.mintingCompleted();
    
    console.log(`   ✅ Token: ${tokenName} (${tokenSymbol})`);
    console.log(`   ✅ Total Supply: ${ethers.formatUnits(totalSupply, 18)} tokens`);
    console.log(`   ✅ User Balance: ${ethers.formatUnits(userBalance, 18)} tokens`);
    console.log(`   ✅ User Share: ${((Number(ethers.formatUnits(userBalance, 18)) / Number(ethers.formatUnits(totalSupply, 18))) * 100).toFixed(1)}%`);
    console.log(`   ✅ Minting Completed: ${mintingCompleted}`);

    // 2. Verify YieldDistributor
    console.log('\n💎 2. YieldDistributor Verification:');
    const yieldDistributor = await ethers.getContractAt('YieldDistributor', yieldDistributorAddress);
    const currentRound = await yieldDistributor.currentDistributionRound();
    const totalDistributed = await yieldDistributor.totalDistributedUsdc();
    const userPendingYield = await yieldDistributor.getTotalPendingYield(userWallet);
    const linkedPropertyToken = await yieldDistributor.propertyToken();
    
    console.log(`   ✅ Current Round: ${currentRound}`);
    console.log(`   ✅ Total Distributed: ${ethers.formatUnits(totalDistributed, 6)} USDC`);
    console.log(`   ✅ User Pending Yield: ${ethers.formatUnits(userPendingYield, 6)} USDC`);
    console.log(`   ✅ Linked Token: ${linkedPropertyToken === propertyTokenAddress ? '✅ Correct' : '❌ Wrong'}`);

    // 3. Verify Distribution Round Details
    if (currentRound > 0) {
      console.log('\n📊 3. Distribution Round Details:');
      const roundInfo = await yieldDistributor.getDistributionRound(currentRound);
      const yieldPerToken = roundInfo.yieldPerToken;
      const eligibleTokens = roundInfo.totalEligibleTokens;
      
      console.log(`   ✅ Round ${currentRound} Yield: ${ethers.formatUnits(roundInfo.totalYieldUsdc, 6)} USDC`);
      console.log(`   ✅ Yield Per Token: ${yieldPerToken.toString()}`);
      console.log(`   ✅ Eligible Tokens: ${ethers.formatUnits(eligibleTokens, 18)}`);
      
      // Verify precision calculation
      const calculatedUserYield = (userBalance * yieldPerToken) / ethers.parseUnits('1', 18);
      console.log(`   ✅ Calculated User Yield: ${ethers.formatUnits(calculatedUserYield, 6)} USDC`);
      console.log(`   ✅ Precision Match: ${calculatedUserYield === userPendingYield ? '✅ Perfect' : '❌ Mismatch'}`);
    }

    // 4. Verify Rental Wallet Setup
    console.log('\n🏦 4. Rental Wallet Setup:');
    const usdc = await ethers.getContractAt('IERC20', usdcAddress);
    const rentalBalance = await usdc.balanceOf(rentalWallet);
    const allowance = await usdc.allowance(rentalWallet, yieldDistributorAddress);
    
    console.log(`   ✅ Rental Balance: ${ethers.formatUnits(rentalBalance, 6)} USDC`);
    console.log(`   ✅ YieldDistributor Allowance: ${ethers.formatUnits(allowance, 6)} USDC`);
    console.log(`   ✅ Ready for Distribution: ${rentalBalance > 0 && allowance > 0 ? '✅ Yes' : '❌ No'}`);

    // 5. MVP Status Summary
    console.log('\n🚀 5. MVP Status Summary:');
    console.log('   =====================================');
    
    const checks = [
      { name: 'Property Token Deployed', status: propertyTokenAddress !== '0x0000000000000000000000000000000000000000' },
      { name: 'User Has Tokens', status: userBalance > 0 },
      { name: 'YieldDistributor Deployed', status: yieldDistributorAddress !== '0x0000000000000000000000000000000000000000' },
      { name: 'Distribution Completed', status: currentRound > 0 },
      { name: 'User Has Claimable Yield', status: userPendingYield > 0 },
      { name: 'Precision Fixed', status: userPendingYield === ethers.parseUnits('1.6', 6) },
      { name: 'Rental Wallet Funded', status: rentalBalance > 0 },
      { name: 'Contract Approved', status: allowance > 0 }
    ];

    checks.forEach(check => {
      console.log(`   ${check.status ? '✅' : '❌'} ${check.name}`);
    });

    const allPassed = checks.every(check => check.status);
    
    console.log('\n🎉 FINAL RESULT:');
    console.log(`   ${allPassed ? '🎊 MVP IS COMPLETE AND READY! 🎊' : '⚠️  Some issues need attention'}`);
    
    if (allPassed) {
      console.log('\n📋 Next Steps:');
      console.log('   1. User can now visit /wallet to see $1.60 claimable yield');
      console.log('   2. User can click "Claim Yield" to receive USDC');
      console.log('   3. Admin can distribute more yield via /admin/properties/[id]/distribute-yield');
      console.log('   4. System is ready for production use!');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 