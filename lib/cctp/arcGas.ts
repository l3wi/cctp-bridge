/** Arc native USDC has 18 decimals; its ERC-20 view has 6, sharing one balance. */
const NATIVE_PER_ATOMIC = 1_000_000_000_000n;
// Conservative budget for both approval and burn, including the custom-fee hook path.
export const ARC_BRIDGE_GAS_BUDGET = 1_000_000n;
const ARC_MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

export function getArcMaxAmount(tokenBalance: bigint, nativeBalance: bigint, maxFeePerGas: bigint): bigint {
  if (tokenBalance < 0n || nativeBalance < 0n || maxFeePerGas < 0n) throw new Error("Invalid gas reserve input");
  const price = maxFeePerGas > ARC_MIN_MAX_FEE_PER_GAS ? maxFeePerGas : ARC_MIN_MAX_FEE_PER_GAS;
  const reserveNative = price * ARC_BRIDGE_GAS_BUDGET * 2n;
  const spendableNative = nativeBalance > reserveNative ? nativeBalance - reserveNative : 0n;
  const spendableAtomic = spendableNative / NATIVE_PER_ATOMIC;
  return spendableAtomic < tokenBalance ? spendableAtomic : tokenBalance;
}
