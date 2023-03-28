// import { FACTORY_ADDRESS, FeeAmount, nearestUsableTick, Pool, TICK_SPACINGS, tickToPrice } from '@sushiswap/v3-sdk'
// import { ZERO_ADDRESS } from 'constants/misc'
// import { useAllV3TicksQuery } from 'graphql/thegraph/__generated__/types-and-hooks'
// import { TickData, Ticks } from 'graphql/thegraph/AllV3TicksQuery'
// import { apolloClient } from 'graphql/thegraph/apollo'
// import { useSingleContractMultipleData } from 'lib/hooks/multicall'
// import { useEffect, useMemo, useState } from 'react'
// import computeSurroundingTicks from 'utils/computeSurroundingTicks'
//
// import { V3_CORE_FACTORY_ADDRESSES } from '../constants/addresses'
// import { useTickLens } from './useContract'
// import { ChainId } from '@sushiswap/chain'
// import { PoolState, usePool } from './useConcentratedLiquidityPools'
// import { JSBI } from '@sushiswap/math'
// import { Currency } from '@sushiswap/currency'
//
// const PRICE_FIXED_DIGITS = 8
// const CHAIN_IDS_MISSING_SUBGRAPH_DATA = [SupportedChainId.ARBITRUM_ONE, SupportedChainId.ARBITRUM_GOERLI]
//
// // Tick with fields parsed to JSBIs, and active liquidity computed.
// export interface TickProcessed {
//   tick: number
//   liquidityActive: JSBI
//   liquidityNet: JSBI
//   price0: string
// }
//
// const REFRESH_FREQUENCY = { blocksPerFetch: 2 }
//
// const getActiveTick = (tickCurrent: number | undefined, feeAmount: FeeAmount | undefined) =>
//   tickCurrent && feeAmount ? Math.floor(tickCurrent / TICK_SPACINGS[feeAmount]) * TICK_SPACINGS[feeAmount] : undefined
//
// const bitmapIndex = (tick: number, tickSpacing: number) => {
//   return Math.floor(tick / tickSpacing / 256)
// }
//
// function useTicksFromTickLens({
//   chainId,
//   currencyA,
//   currencyB,
//   feeAmount,
//   numSurroundingTicks = 125,
// }: {
//   chainId: ChainId
//   currencyA: Currency | undefined
//   currencyB: Currency | undefined
//   feeAmount: FeeAmount | undefined
//   numSurroundingTicks: number | undefined
// }) {
//   const [tickDataLatestSynced, setTickDataLatestSynced] = useState<TickData[]>([])
//
//   const [poolState, pool] = usePool({ chainId, token0: currencyA, token1: currencyB, feeAmount })
//
//   const tickSpacing = feeAmount && TICK_SPACINGS[feeAmount]
//
//   // Find nearest valid tick for pool in case tick is not initialized.
//   const activeTick = pool?.tickCurrent && tickSpacing ? nearestUsableTick(pool?.tickCurrent, tickSpacing) : undefined
//
//   const poolAddress =
//     currencyA && currencyB && feeAmount && poolState === PoolState.EXISTS
//       ? Pool.getAddress(
//           currencyA?.wrapped,
//           currencyB?.wrapped,
//           feeAmount,
//           undefined,
//           // TODO use map here
//           FACTORY_ADDRESS
//         )
//       : undefined
//
//   // it is also possible to grab all tick data but it is extremely slow
//   // bitmapIndex(nearestUsableTick(TickMath.MIN_TICK, tickSpacing), tickSpacing)
//   const minIndex = useMemo(
//     () =>
//       tickSpacing && activeTick ? bitmapIndex(activeTick - numSurroundingTicks * tickSpacing, tickSpacing) : undefined,
//     [tickSpacing, activeTick, numSurroundingTicks]
//   )
//
//   const maxIndex = useMemo(
//     () =>
//       tickSpacing && activeTick ? bitmapIndex(activeTick + numSurroundingTicks * tickSpacing, tickSpacing) : undefined,
//     [tickSpacing, activeTick, numSurroundingTicks]
//   )
//
//   const tickLensArgs: [string, number][] = useMemo(
//     () =>
//       maxIndex && minIndex && poolAddress && poolAddress !== ZERO_ADDRESS
//         ? new Array(maxIndex - minIndex + 1)
//             .fill(0)
//             .map((_, i) => i + minIndex)
//             .map((wordIndex) => [poolAddress, wordIndex])
//         : [],
//     [minIndex, maxIndex, poolAddress]
//   )
//
//   const tickLens = useTickLens()
//   const callStates = useSingleContractMultipleData(
//     tickLensArgs.length > 0 ? tickLens : undefined,
//     'getPopulatedTicksInWord',
//     tickLensArgs,
//     REFRESH_FREQUENCY
//   )
//
//   const isError = useMemo(() => callStates.some(({ error }) => error), [callStates])
//   const isLoading = useMemo(() => callStates.some(({ loading }) => loading), [callStates])
//   const IsSyncing = useMemo(() => callStates.some(({ syncing }) => syncing), [callStates])
//   const isValid = useMemo(() => callStates.some(({ valid }) => valid), [callStates])
//
//   const tickData: TickData[] = useMemo(
//     () =>
//       callStates
//         .map(({ result }) => result?.populatedTicks)
//         .reduce(
//           (accumulator, current) => [
//             ...accumulator,
//             ...(current?.map((tickData: TickData) => {
//               return {
//                 tick: tickData.tick,
//                 liquidityNet: JSBI.BigInt(tickData.liquidityNet),
//               }
//             }) ?? []),
//           ],
//           []
//         ),
//     [callStates]
//   )
//
//   // reset on input change
//   useEffect(() => {
//     setTickDataLatestSynced([])
//   }, [currencyA, currencyB, feeAmount])
//
//   // return the latest synced tickData even if we are still loading the newest data
//   useEffect(() => {
//     if (!IsSyncing && !isLoading && !isError && isValid) {
//       setTickDataLatestSynced(tickData.sort((a, b) => a.tick - b.tick))
//     }
//   }, [isError, isLoading, IsSyncing, tickData, isValid])
//
//   return useMemo(
//     () => ({ isLoading, IsSyncing, isError, isValid, tickData: tickDataLatestSynced }),
//     [isLoading, IsSyncing, isError, isValid, tickDataLatestSynced]
//   )
// }
//
// function useTicksFromSubgraph({
//   chainId,
//   currencyA,
//   currencyB,
//   feeAmount,
//   skip = 0,
// }: {
//   chainId: ChainId
//   currencyA: Currency | undefined
//   currencyB: Currency | undefined
//   feeAmount: FeeAmount | undefined
//   skip: number | undefined
// }) {
//   const poolAddress =
//     currencyA && currencyB && feeAmount
//       ? Pool.getAddress(
//           currencyA?.wrapped,
//           currencyB?.wrapped,
//           feeAmount,
//           undefined,
//           chainId ? V3_CORE_FACTORY_ADDRESSES[chainId] : undefined
//         )
//       : undefined
//
//   return useAllV3TicksQuery({
//     variables: { poolAddress: poolAddress?.toLowerCase(), skip },
//     skip: !poolAddress,
//     pollInterval: '30000',
//     client: apolloClient,
//   })
// }
//
// const MAX_THE_GRAPH_TICK_FETCH_VALUE = 1000
// // Fetches all ticks for a given pool
// function useAllV3Ticks(
//   currencyA: Currency | undefined,
//   currencyB: Currency | undefined,
//   feeAmount: FeeAmount | undefined
// ): {
//   isLoading: boolean
//   error: unknown
//   ticks: TickData[] | undefined
// } {
//   const useSubgraph = currencyA ? !CHAIN_IDS_MISSING_SUBGRAPH_DATA.includes(currencyA.chainId) : true
//
//   const tickLensTickData = useTicksFromTickLens(!useSubgraph ? currencyA : undefined, currencyB, feeAmount)
//
//   const [skipNumber, setSkipNumber] = useState(0)
//   const [subgraphTickData, setSubgraphTickData] = useState<Ticks>([])
//   const {
//     data,
//     error,
//     loading: isLoading,
//   } = useTicksFromSubgraph(useSubgraph ? currencyA : undefined, currencyB, feeAmount, skipNumber)
//
//   useEffect(() => {
//     if (data?.ticks.length) {
//       setSubgraphTickData((tickData) => [...tickData, ...data.ticks])
//       if (data.ticks.length === MAX_THE_GRAPH_TICK_FETCH_VALUE) {
//         setSkipNumber((skipNumber) => skipNumber + MAX_THE_GRAPH_TICK_FETCH_VALUE)
//       }
//     }
//   }, [data?.ticks])
//
//   return {
//     isLoading: useSubgraph
//       ? isLoading || data?.ticks.length === MAX_THE_GRAPH_TICK_FETCH_VALUE
//       : tickLensTickData.isLoading,
//     error: useSubgraph ? error : tickLensTickData.isError,
//     ticks: useSubgraph ? subgraphTickData : tickLensTickData.tickData,
//   }
// }
//
// export function usePoolActiveLiquidity({
//   chainId,
//   currencyA,
//   currencyB,
//   feeAmount,
// }: {
//   chainId: ChainId
//   currencyA: Currency | undefined
//   currencyB: Currency | undefined
//   feeAmount: FeeAmount | undefined
// }): {
//   isLoading: boolean
//   error: any
//   activeTick: number | undefined
//   data: TickProcessed[] | undefined
// } {
//   const pool = usePool({ chainId, token0: currencyA, token1: currencyB, feeAmount })
//
//   // Find nearest valid tick for pool in case tick is not initialized.
//   const activeTick = useMemo(() => getActiveTick(pool[1]?.tickCurrent, feeAmount), [pool, feeAmount])
//
//   const { isLoading, error, ticks } = useAllV3Ticks(currencyA, currencyB, feeAmount)
//
//   return useMemo(() => {
//     if (
//       !currencyA ||
//       !currencyB ||
//       activeTick === undefined ||
//       pool[0] !== PoolState.EXISTS ||
//       !ticks ||
//       ticks.length === 0 ||
//       isLoading
//     ) {
//       return {
//         isLoading: isLoading || pool[0] === PoolState.LOADING,
//         error,
//         activeTick,
//         data: undefined,
//       }
//     }
//
//     const token0 = currencyA?.wrapped
//     const token1 = currencyB?.wrapped
//
//     // find where the active tick would be to partition the array
//     // if the active tick is initialized, the pivot will be an element
//     // if not, take the previous tick as pivot
//     const pivot = ticks.findIndex(({ tick }) => tick > activeTick) - 1
//
//     if (pivot < 0) {
//       // consider setting a local error
//       console.error('TickData pivot not found')
//       return {
//         isLoading,
//         error,
//         activeTick,
//         data: undefined,
//       }
//     }
//
//     const activeTickProcessed: TickProcessed = {
//       liquidityActive: JSBI.BigInt(pool[1]?.liquidity ?? 0),
//       tick: activeTick,
//       liquidityNet: Number(ticks[pivot].tick) === activeTick ? JSBI.BigInt(ticks[pivot].liquidityNet) : JSBI.BigInt(0),
//       price0: tickToPrice(token0, token1, activeTick).toFixed(PRICE_FIXED_DIGITS),
//     }
//
//     const subsequentTicks = computeSurroundingTicks(token0, token1, activeTickProcessed, ticks, pivot, true)
//
//     const previousTicks = computeSurroundingTicks(token0, token1, activeTickProcessed, ticks, pivot, false)
//
//     const ticksProcessed = previousTicks.concat(activeTickProcessed).concat(subsequentTicks)
//
//     return {
//       isLoading,
//       error,
//       activeTick,
//       data: ticksProcessed,
//     }
//   }, [currencyA, currencyB, activeTick, pool, ticks, isLoading, error])
// }
