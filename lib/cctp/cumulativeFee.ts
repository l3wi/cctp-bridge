/** Gross Standard USDC volume, in six-decimal atomic units. */
export const STANDARD_VOLUME_BAND = 1_000_000_000_000n;
export const STANDARD_BAND_FEE = 100_000_000n;

export function quoteCumulativeFee(volume: bigint, nextThreshold: bigint, amount: bigint) {
  if (amount <= 0n || amount > STANDARD_VOLUME_BAND) throw new Error("Invalid bridge amount");
  // One initial payment only, even when the imported balance spans many bands.
  const fee = volume + amount >= nextThreshold ? STANDARD_BAND_FEE : 0n;
  if (fee >= amount) throw new Error("Increase the bridge amount above the 100 USDC fee");
  return {
    fee,
    nextThreshold: fee > 0n
      ? ((volume + amount) / STANDARD_VOLUME_BAND + 1n) * STANDARD_VOLUME_BAND
      : nextThreshold,
  };
}

export interface StandardFeeRequest {
  requestId: string;
  address: string;
  sourceChainId: number | "Solana" | "Solana_Devnet";
  amountAtomic: string;
  issuedAt: number;
}

export interface StandardFeeReservation {
  id: string;
  token: string;
  chargeFee: boolean;
  feeAtomic: string;
  recipient: string;
}
