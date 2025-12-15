import { expect } from "chai";
import { ethers } from "hardhat";

const Q96 = 2n ** 96n;

describe("V3FixedFeeManager (fee=0.03%=300)", function () {
  it("create pool, mint full-range liquidity, swap with fixed fee=300", async function () {
    const [alice] = await ethers.getSigners();

    // Deploy Uniswap V3 core/periphery
    const Factory = await ethers.getContractFactory("UniswapV3Factory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.waitForDeployment();

    const SwapRouter = await ethers.getContractFactory("SwapRouter");
    const router = await SwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();

    const NPM = await ethers.getContractFactory("NonfungiblePositionManager");
    const positionManager = await NPM.deploy(
      await factory.getAddress(),
      await weth.getAddress(),
      ethers.ZeroAddress
    );
    await positionManager.waitForDeployment();

    const Manager = await ethers.getContractFactory("V3FixedFeeManager");
    const manager = await Manager.deploy(
      await factory.getAddress(),
      await positionManager.getAddress(),
      await router.getAddress()
    );
    await manager.waitForDeployment();

    // Deploy two tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("TokenA", "A", 18);
    const tokenB = await MockERC20.deploy("TokenB", "B", 18);
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    const addrA = await tokenA.getAddress();
    const addrB = await tokenB.getAddress();

    // Mint balances to alice
    const mintAmt = ethers.parseEther("1000");
    await tokenA.mint(alice.address, mintAmt);
    await tokenB.mint(alice.address, mintAmt);

    // Create & init pool at 1:1
    const sqrtPriceX96 = Q96; // 1:1 => 2^96
    await manager.createAndInitializePoolIfNecessary(addrA, addrB, sqrtPriceX96);

    const poolAddr = await manager.getPool(addrA, addrB);
    expect(poolAddr).to.not.equal(ethers.ZeroAddress);

    const pool = await ethers.getContractAt("IUniswapV3Pool", poolAddr);
    expect(await pool.fee()).to.equal(300);

    // For fee=300, tickSpacing is 60
    expect(await pool.tickSpacing()).to.equal(60);

    // Approve tokens to positionManager for mint
    await tokenA.approve(await positionManager.getAddress(), mintAmt);
    await tokenB.approve(await positionManager.getAddress(), mintAmt);

    // Full-range ticks must be multiples of tickSpacing (60)
    const tickLower = -887220;
    const tickUpper = 887220;

    // token0/token1 must be sorted
    const token0 = addrA.toLowerCase() < addrB.toLowerCase() ? addrA : addrB;
    const token1 = addrA.toLowerCase() < addrB.toLowerCase() ? addrB : addrA;

    const params = {
      token0,
      token1,
      fee: 300,
      tickLower,
      tickUpper,
      amount0Desired: ethers.parseEther("100"),
      amount1Desired: ethers.parseEther("100"),
      amount0Min: 0,
      amount1Min: 0,
      recipient: alice.address,
      deadline: Math.floor(Date.now() / 1000) + 3600
    };

    await expect(manager.mintPosition(params)).to.not.be.reverted;

    // Approve tokenA to router for swap
    await tokenA.approve(await router.getAddress(), ethers.parseEther("1"));

    const beforeB = await tokenB.balanceOf(alice.address);

    // Swap A -> B via manager (fee fixed 300)
    await expect(
      manager.swapExactInputSingle(addrA, addrB, ethers.parseEther("1"), 0, 0)
    ).to.not.be.reverted;

    const afterB = await tokenB.balanceOf(alice.address);
    expect(afterB).to.be.greaterThan(beforeB);
  });

  it("reject mint if fee != 300", async function () {
    const [alice] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("UniswapV3Factory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.waitForDeployment();

    const SwapRouter = await ethers.getContractFactory("SwapRouter");
    const router = await SwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();

    const NPM = await ethers.getContractFactory("NonfungiblePositionManager");
    const positionManager = await NPM.deploy(
      await factory.getAddress(),
      await weth.getAddress(),
      ethers.ZeroAddress
    );
    await positionManager.waitForDeployment();

    const Manager = await ethers.getContractFactory("V3FixedFeeManager");
    const manager = await Manager.deploy(
      await factory.getAddress(),
      await positionManager.getAddress(),
      await router.getAddress()
    );
    await manager.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("TokenA", "A", 18);
    const tokenB = await MockERC20.deploy("TokenB", "B", 18);
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    const addrA = await tokenA.getAddress();
    const addrB = await tokenB.getAddress();

    const token0 = addrA.toLowerCase() < addrB.toLowerCase() ? addrA : addrB;
    const token1 = addrA.toLowerCase() < addrB.toLowerCase() ? addrB : addrA;

    const paramsBadFee = {
      token0,
      token1,
      fee: 500, // bad
      tickLower: -887220,
      tickUpper: 887220,
      amount0Desired: ethers.parseEther("1"),
      amount1Desired: ethers.parseEther("1"),
      amount0Min: 0,
      amount1Min: 0,
      recipient: alice.address,
      deadline: Math.floor(Date.now() / 1000) + 3600
    };

    await expect(manager.mintPosition(paramsBadFee)).to.be.revertedWith("fee must be 0.03%");
  });
});
