import { BigNumber } from '@ethersproject/bignumber'

export const TYPICAL_SWAP_GAS_COST = 60_000
export const TYPICAL_MINIMAL_LIQUIDITY = 1000

export interface RToken {
  name: string
  symbol: string
  address: string
  chainId?: number | string
  tokenId?: string // if tokens' ids are equal then tokens are the same
}

export function setTokenId(...tokens: RToken[]) {
  tokens.forEach((t) => {
    if (!t.tokenId) t.tokenId = `${t.address}_${t.chainId}`
  })
}

export abstract class RPool {
  readonly address: string
  readonly tokens: RToken[]
  readonly fee: number
  reserves: BigNumber[]
  readonly minLiquidity: number
  readonly swapGasCost: number

  constructor(
    address: string,
    tokens: RToken[],
    fee: number,
    reserves: BigNumber[],
    minLiquidity = TYPICAL_MINIMAL_LIQUIDITY,
    swapGasCost = TYPICAL_SWAP_GAS_COST
  ) {
    this.address = address
    this.tokens = tokens
    setTokenId(...tokens)
    this.fee = fee
    this.minLiquidity = minLiquidity
    this.swapGasCost = swapGasCost
    this.reserves = reserves
  }

  updateReserves(res: BigNumber[]) {
    this.reserves = res
  }
  getReserve(i: number) {
    return this.reserves[i]
  }

  // Returns [<output amount>, <gas consumption estimation>]
  // Should throw if the rest of liquidity is lesser than minLiquidity
  abstract calcOutByIn(amountIn: number, direction: boolean): { out: number; gasSpent: number }
  abstract calcInByOut(amountOut: number, direction: boolean): { inp: number; gasSpent: number }
  abstract calcCurrentPriceWithoutFee(direction: boolean): number

  // precision of calcOutByIn
  granularity0() {
    return 1
  }
  granularity1() {
    return 1
  }

  alwaysAppropriateForPricing(): boolean {
    return false
  }
}

export class ConstantProductRPool extends RPool {
  reserve0Number: number
  reserve1Number: number

  constructor(address: string, token0: RToken, token1: RToken, fee: number, reserve0: BigNumber, reserve1: BigNumber) {
    super(address, [token0, token1], fee, [reserve0, reserve1])
    this.reserve0Number = parseInt(reserve0.toString())
    this.reserve1Number = parseInt(reserve1.toString())
  }

  updateReserves(res: BigNumber[]) {
    this.reserves = res
    this.reserve0Number = parseInt(res[0].toString())
    this.reserve1Number = parseInt(res[1].toString())
  }

  calcOutByIn(amountIn: number, direction: boolean): { out: number; gasSpent: number } {
    const x = direction ? this.reserve0Number : this.reserve1Number
    const y = direction ? this.reserve1Number : this.reserve0Number
    const out = (y * amountIn) / (x / (1 - this.fee) + amountIn)
    if (y - out < this.minLiquidity) throw 'CP OutOfLiquidity'
    return { out, gasSpent: this.swapGasCost }
  }

  calcInByOut(amountOut: number, direction: boolean): { inp: number; gasSpent: number } {
    const x = direction ? this.reserve0Number : this.reserve1Number
    const y = direction ? this.reserve1Number : this.reserve0Number
    if (y - amountOut < this.minLiquidity)
      // not possible swap
      return { inp: Number.POSITIVE_INFINITY, gasSpent: this.swapGasCost }

    const input = (x * amountOut) / (1 - this.fee) / (y - amountOut)
    return { inp: input, gasSpent: this.swapGasCost }
  }

  calcCurrentPriceWithoutFee(direction: boolean): number {
    return this.calcPrice(0, direction, false)
  }

  calcPrice(amountIn: number, direction: boolean, takeFeeIntoAccount: boolean): number {
    const x = direction ? this.reserve0Number : this.reserve1Number
    const y = direction ? this.reserve1Number : this.reserve0Number
    const oneMinusFee = takeFeeIntoAccount ? 1 - this.fee : 1
    const xf = x / oneMinusFee
    return (y * xf) / (xf + amountIn) / (xf + amountIn)
  }

  calcInputByPrice(price: number, direction: boolean, takeFeeIntoAccount: boolean): number {
    const x = direction ? this.reserve0Number : this.reserve1Number
    const y = direction ? this.reserve1Number : this.reserve0Number
    const oneMinusFee = takeFeeIntoAccount ? 1 - this.fee : 1
    const xf = x / oneMinusFee
    return Math.sqrt(y * xf * price) - xf // TODO: or y*xf/price ???
  }

  getLiquidity() {
    return Math.sqrt(this.reserve0Number * this.reserve1Number)
  }
}
