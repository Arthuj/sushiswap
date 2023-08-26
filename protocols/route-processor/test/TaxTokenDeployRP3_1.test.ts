import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers'
import { routeProcessor2Abi } from '@sushiswap/abi'
import { erc20Abi } from '@sushiswap/abi'
import { ChainId, chainName } from '@sushiswap/chain'
import { Native, Token } from '@sushiswap/currency'
import { DataFetcher, LiquidityProviders, Router, RPParams } from '@sushiswap/router'
import { MultiRoute, RouteStatus } from '@sushiswap/tines'
import { Contract } from '@sushiswap/types'
import { expect } from 'chai'
import { config } from 'hardhat'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { Address, Client, createPublicClient, custom, HDAccount, Hex, walletActions } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { hardhat } from 'viem/chains'

import RouteProcessor3_1 from '../artifacts/contracts/RouteProcessor3_1.sol/RouteProcessor3_1.json'

async function createHardhatProvider(chainId: ChainId, url: string, blockNumber: number) {
  return await createProvider(
    {
      ...config,
      defaultNetwork: 'hardhat',
      networks: {
        ...config.networks,
        hardhat: {
          ...config.networks.hardhat,
          chainId,
          forking: {
            enabled: true,
            url,
            blockNumber,
          },
        },
      },
    },
    'hardhat'
  )
}

async function getTestEnvironment(chainId: ChainId, url: string, blockNumber: number) {
  const provider = await createHardhatProvider(chainId, url, blockNumber)
  const client = createPublicClient({
    batch: {
      multicall: {
        batchSize: 2048,
        wait: 1,
      },
    },
    chain: {
      ...hardhat,
      contracts: {
        multicall3: {
          address: '0xca11bde05977b3631167028862be2a173976ca11',
          blockCreated: 25770160,
        },
      },
      id: chainId,
    },
    transport: custom(provider),
  }).extend(walletActions)

  const accounts = config.networks.hardhat.accounts as { mnemonic: string }
  const user = mnemonicToAccount(accounts.mnemonic, { accountIndex: 0 })

  const dataFetcher = new DataFetcher(chainId, client)
  dataFetcher.startDataFetching([LiquidityProviders.SushiSwapV2, LiquidityProviders.UniswapV2])

  const RouteProcessorTx = await client.deployContract({
    chain: null,
    abi: routeProcessor2Abi,
    bytecode: RouteProcessor3_1.bytecode as Hex,
    account: user.address,
    args: ['0x0000000000000000000000000000000000000000', []],
  })
  const RouteProcessorAddress = (await client.waitForTransactionReceipt({ hash: RouteProcessorTx })).contractAddress
  if (!RouteProcessorAddress) throw new Error('RouteProcessorAddress is undefined')
  const RouteProcessor = {
    address: RouteProcessorAddress,
    abi: routeProcessor2Abi,
  }

  console.log(`  Network: ${chainName[chainId]}, Forked Block: ${await client.getBlockNumber()}`)

  return {
    chainId,
    client,
    rp: RouteProcessor,
    user,
    dataFetcher,
    snapshot: await takeSnapshot(),
  } satisfies {
    chainId: ChainId
    client: Client
    rp: Contract<typeof routeProcessor2Abi>
    user: HDAccount
    dataFetcher: DataFetcher
    snapshot: SnapshotRestorer
  }
}

type TestEnvironment = Awaited<ReturnType<typeof getTestEnvironment>>

export async function checkTaxTokenTransfer(env: TestEnvironment, route: MultiRoute): Promise<boolean | undefined> {
  if (route.legs.length >= 2) {
    return await env.client.readContract({
      address: route.toToken.address as Address, //'0x8b2060CC6E55Fa68204B3Bc8B226FC61B3512C1f', //bpsTest
      abi: erc20Abi,
      // @ts-ignore
      functionName: 'transfer',
      args: [env.rp.address, route.amountOutBI],
      account: route.legs[1].poolAddress, // '0x9bd731319718d417f47083c9653de5f35fce5698', // sushiswap pair
    })
  }
}

async function testTaxTokenBuy(
  env: TestEnvironment,
  route: MultiRoute,
  rpParams: RPParams,
  account: Address
): Promise<bigint> {
  const amountOutReal = await env.client.readContract({
    address: env.rp.address,
    abi: routeProcessor2Abi,
    // @ts-ignore
    functionName: 'processRoute',
    args: [
      rpParams.tokenIn as Address,
      rpParams.amountIn,
      rpParams.tokenOut as Address,
      0n,
      rpParams.to as Address,
      rpParams.routeCode as Address, // !!!!
    ],
    value: rpParams.value,
    account,
  })
  await env.client.writeContract({
    address: env.rp.address,
    abi: routeProcessor2Abi,
    // @ts-ignore
    functionName: 'processRoute',
    args: [
      rpParams.tokenIn as Address,
      rpParams.amountIn,
      rpParams.tokenOut as Address,
      0n,
      rpParams.to as Address,
      rpParams.routeCode as Address, // !!!!
    ],
    value: rpParams.value ?? 0n,
    account,
  })
  return amountOutReal
}

async function testTaxTokenSell(
  env: TestEnvironment,
  route: MultiRoute,
  rpParams: RPParams,
  account: Address
): Promise<bigint> {
  await env.client.writeContract({
    address: route.fromToken.address as Address,
    abi: erc20Abi,
    // @ts-ignore
    functionName: 'approve',
    args: [env.rp.address, route.amountInBI],
    account,
  })
  const amountOutReal = await env.client.readContract({
    address: env.rp.address,
    abi: routeProcessor2Abi,
    // @ts-ignore
    functionName: 'processRoute',
    args: [
      rpParams.tokenIn as Address,
      rpParams.amountIn,
      rpParams.tokenOut as Address,
      0n,
      rpParams.to as Address,
      rpParams.routeCode as Address, // !!!!
    ],
    value: rpParams.value,
    account,
  })
  return amountOutReal
}

async function testTaxToken(args: { env: TestEnvironment; taxToken: Token; amountIn?: bigint }) {
  const chainId = args.env.chainId
  const fromToken = Native.onChain(chainId)
  const toToken = args.taxToken
  const amountIn = args.amountIn ?? BigInt(1e18)

  await args.env.dataFetcher.fetchPoolsForToken(fromToken, toToken)
  const pcMap = args.env.dataFetcher.getCurrentPoolCodeMap(fromToken, toToken)

  const routeBuy = Router.findBestRoute(pcMap, chainId, fromToken, amountIn, toToken, 30e9)
  expect(routeBuy.status).not.eq(RouteStatus.NoWay)
  // console.log(Router.routeToHumanString(pcMap, routeBuy, fromToken, toToken))
  // console.log(
  //   'ROUTE:',
  //   routeBuy.legs.map(
  //     (l) =>
  //       `${l.tokenFrom.symbol} -> ${l.tokenTo.symbol}  ${l.poolAddress}  ${l.assumedAmountIn} -> ${l.assumedAmountOut}`
  //   )
  // )

  const rpParamsBuy = Router.routeProcessor3_1Params(
    pcMap,
    routeBuy,
    fromToken,
    toToken,
    args.env.user.address,
    args.env.rp.address
  )
  expect(rpParamsBuy).not.undefined

  // try {
  //   await checkTaxTokenTransfer(args.env, routeBuy)
  // } catch (e) {
  //   console.log(`Transfer check failed ${toToken.symbol} (${toToken.address}) ${routeBuy.amountOutBI} ${e}`)
  //   return
  // }

  let amountOutReal
  try {
    amountOutReal = await testTaxTokenBuy(args.env, routeBuy, rpParamsBuy, args.env.user.address)
    const diff = routeBuy.amountOutBI == 0n ? -1 : Number(amountOutReal - routeBuy.amountOutBI) / routeBuy.amountOut
    console.log(
      `Routing: ${fromToken.symbol} => ${toToken.symbol} ${routeBuy.legs.length - 1} pools` +
        ` diff = ${diff > 0 ? '+' : ''}${diff} `
    )
  } catch (e) {
    console.log('Routing failed. No connection ? ' + e)
    expect(e).equal(undefined)
    return
  }

  const routeSell = Router.findBestRoute(pcMap, chainId, toToken, amountOutReal, fromToken, 30e9)
  expect(routeSell.status).not.eq(RouteStatus.NoWay)
  // console.log(Router.routeToHumanString(pcMap, routeSell, toToken, fromToken))
  // console.log(
  //   'ROUTE:',
  //   routeSell.legs.map(
  //     (l) =>
  //       `${l.tokenFrom.symbol} -> ${l.tokenTo.symbol}  ${l.poolAddress}  ${l.assumedAmountIn} -> ${l.assumedAmountOut}`
  //   )
  // )

  const rpParamsSell = Router.routeProcessor3_1Params(
    pcMap,
    routeSell,
    toToken,
    fromToken,
    args.env.user.address,
    args.env.rp.address
  )
  expect(rpParamsSell).not.undefined

  // try {
  //   await checkTaxTokenTransfer(args.env, routeSell)
  // } catch (e) {
  //   console.log(`Transfer check failed ${toToken.symbol} (${toToken.address}) ${routeSell.amountOutBI} ${e}`)
  //   return
  // }
  try {
    const amountOutReal = await testTaxTokenSell(args.env, routeSell, rpParamsSell, args.env.user.address)
    const diff = routeSell.amountOutBI == 0n ? -1 : Number(amountOutReal - routeSell.amountOutBI) / routeSell.amountOut
    console.log(
      `Routing: ${toToken.symbol} => ${fromToken.symbol} ${routeSell.legs.length - 1} pools` +
        ` diff = ${diff > 0 ? '+' : ''}${diff} `
    )
  } catch (e) {
    console.log('Routing failed. No connection ? ' + e)
    expect(e).equal(undefined)
  }
}

describe('RouteProcessor3_1 tax token test for BASE', async function () {
  let env: TestEnvironment

  before(async () => {
    env = await getTestEnvironment(
      ChainId.BASE,
      `https://lb.drpc.org/ogrpc?network=base&dkey=${process.env.DRPC_ID}`,
      3033333
    )
  })

  it.skip('BASE <=> LCRV', async function () {
    const LCRV = new Token({
      chainId: ChainId.BASE,
      address: '0x8b2060CC6E55Fa68204B3Bc8B226FC61B3512C1f',
      name: 'Left Curve DAO',
      symbol: 'LCRV',
      decimals: 9,
    })
    await testTaxToken({
      env,
      taxToken: LCRV,
      amountIn: BigInt(1e15),
    })
  })

  it('BASE <=> bpsTEST', async function () {
    const bpsTEST = new Token({
      chainId: ChainId.BASE,
      address: '0x93980959778166ccbB95Db7EcF52607240bc541e',
      name: 'bpsTEST',
      symbol: 'bpsTEST',
      decimals: 18,
    })
    await testTaxToken({
      env,
      taxToken: bpsTEST,
      amountIn: BigInt(1e12),
    })
  })
})

describe('RouteProcessor3_1 tax token test for ETHEREUM', async function () {
  let env: TestEnvironment

  before(async () => {
    env = await getTestEnvironment(
      ChainId.ETHEREUM,
      `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_ID}`,
      17980000
    )
  })

  it('ETH => UniBot', async function () {
    const uniBOT = new Token({
      chainId: ChainId.ETHEREUM,
      address: '0xf819d9cb1c2a819fd991781a822de3ca8607c3c9',
      name: 'Unibot',
      symbol: 'UNIBOT',
      decimals: 18,
    })
    await testTaxToken({
      env,
      taxToken: uniBOT,
      amountIn: BigInt(1e18),
    })
  })
})
