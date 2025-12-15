import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  // UniswapV3Factory
  const Factory = await ethers.getContractFactory("UniswapV3Factory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("factory:", await factory.getAddress());

  // WETH9
  const WETH9 = await ethers.getContractFactory("WETH9");
  const weth = await WETH9.deploy();
  await weth.waitForDeployment();
  console.log("weth:", await weth.getAddress());

  // SwapRouter
  const SwapRouter = await ethers.getContractFactory("SwapRouter");
  const router = await SwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
  await router.waitForDeployment();
  console.log("router:", await router.getAddress());

  // NonfungiblePositionManager
  const NPM = await ethers.getContractFactory("NonfungiblePositionManager");
  const positionManager = await NPM.deploy(
    await factory.getAddress(),
    await weth.getAddress(),
    ethers.ZeroAddress // tokenDescriptor: 本地测试填 0 足够
  );
  await positionManager.waitForDeployment();
  console.log("positionManager:", await positionManager.getAddress());

  // V3FixedFeeManager
  const Manager = await ethers.getContractFactory("V3FixedFeeManager");
  const manager = await Manager.deploy(
    await factory.getAddress(),
    await positionManager.getAddress(),
    await router.getAddress()
  );
  await manager.waitForDeployment();
  console.log("V3FixedFeeManager:", await manager.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
