import type { StandardFeeRequest, StandardFeeReservation } from "./cumulativeFee";

const endpoint = "/api/fees/standard";
export async function standardFeeApi<T>(body: object): Promise<T> {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? "Unable to check Standard bridge fee"), { code: result.code });
  return result as T;
}

export async function reserveStandardFeeClient(input: StandardFeeRequest, signature: string) {
  localStorage.setItem(storageKey(input.address), JSON.stringify({ request: input, signature }));
  return standardFeeApi<StandardFeeReservation>({ action: "reserve", ...input, signature });
}

export const updateStandardFeeClient = (r: StandardFeeReservation, action: "broadcast" | "cancel" | "submit" | "rejected", burnHash?: string) =>
  standardFeeApi({ action, id: r.id, token: r.token, burnHash });

const storageKey = (address: string) => `cctp-standard-fee:${address.startsWith("0x") ? address.toLowerCase() : address}`;
export function saveStandardFee(address: string, r: StandardFeeReservation, burnHash?: string) {
  // Persist before broadcast so a refresh cannot discard the reservation.
  localStorage.setItem(storageKey(address), JSON.stringify({ reservation: r, burnHash }));
}
export async function recoverStandardFee(address: string) {
  const saved = localStorage.getItem(storageKey(address));
  if (!saved) return;
  const data = JSON.parse(saved) as { reservation?: StandardFeeReservation; burnHash?: string; request?: StandardFeeRequest; signature?: string };
  let reservation = data.reservation;
  const { burnHash } = data;
  if (!reservation && data.request && data.signature) {
    try {
      reservation = await standardFeeApi<StandardFeeReservation>({ action: "reserve", ...data.request, signature: data.signature });
    } catch (error) {
      if ((error as { code?: string }).code === "EXPIRED_UNRESERVED") { clearStandardFee(address); return; }
      throw error;
    }
  }
  if (!reservation) throw new Error("Unable to recover the previous fee reservation");
  if (burnHash) await updateStandardFeeClient(reservation, "submit", burnHash);
  else await updateStandardFeeClient(reservation, "cancel");
  localStorage.removeItem(storageKey(address));
}

export function clearStandardFee(address: string) { localStorage.removeItem(storageKey(address)); }

/** Receipt polling is a hint; the server independently verifies the chain. */
export async function notifyStandardFeeReceipt(burnHash: string) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("cctp-standard-fee:")) continue;
    const saved = localStorage.getItem(key);
    if (!saved) continue;
    let data: { reservation?: StandardFeeReservation; burnHash?: string };
    try { data = JSON.parse(saved); } catch { continue; }
    if (data.reservation && data.burnHash === burnHash) {
      await updateStandardFeeClient(data.reservation, "submit", burnHash);
    }
  }
}
export function previewStandardFeeClient(input: Pick<StandardFeeRequest, "address" | "sourceChainId" | "amountAtomic">) {
  return standardFeeApi<{ volumeAtomic: string; feeAtomic: string; chargeFee: boolean }>({ action: "preview", ...input });
}
