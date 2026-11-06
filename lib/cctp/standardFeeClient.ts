import type { StandardFeeRequest, StandardFeeReservation } from "./cumulativeFee";

const endpoint = "/api/fees/standard";
export async function standardFeeApi<T>(body: object): Promise<T> {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? "Unable to check Standard bridge fee"), { code: result.code });
  return result as T;
}

export async function reserveStandardFeeClient(input: StandardFeeRequest) {
  saveRecovery(input.address, { request: input });
  return standardFeeApi<StandardFeeReservation>({ action: "reserve", ...input });
}

export const updateStandardFeeClient = (r: StandardFeeReservation, action: "broadcast" | "cancel" | "submit" | "rejected", burnHash?: string) =>
  standardFeeApi<{ ok: boolean; pendingReceipt?: boolean }>({ action, id: r.id, token: r.token, burnHash });

const storagePrefix = "cctp-standard-fee:";
const storageKey = (address: string) => `${storagePrefix}${address.startsWith("0x") ? address.toLowerCase() : address}`;
interface SavedStandardFee {
  reservation?: StandardFeeReservation;
  burnHash?: string;
  request?: StandardFeeRequest;
}
const recoveryId = (entry: SavedStandardFee) => entry.reservation?.id ?? entry.request?.requestId;
function readRecovery(address: string): SavedStandardFee[] {
  const saved = localStorage.getItem(storageKey(address));
  if (!saved) return [];
  const data = JSON.parse(saved) as SavedStandardFee | SavedStandardFee[];
  // Migrate the previously persisted single reservation on the next write.
  return Array.isArray(data) ? data : [data];
}
function saveRecovery(address: string, entry: SavedStandardFee) {
  const entries = readRecovery(address);
  const index = entries.findIndex(saved => recoveryId(saved) === recoveryId(entry));
  if (index < 0) entries.push(entry);
  else entries[index] = { ...entries[index], ...entry };
  localStorage.setItem(storageKey(address), JSON.stringify(entries));
}
export function saveStandardFee(address: string, r: StandardFeeReservation, burnHash?: string) {
  // Keep every unresolved burn when another bridge starts before its receipt appears.
  saveRecovery(address, { reservation: r, ...(burnHash ? { burnHash } : {}) });
}
export async function recoverStandardFee(address: string) {
  for (const data of readRecovery(address)) {
    const id = recoveryId(data);
    if (!id) continue;
    try {
      let reservation = data.reservation;
      if (!reservation && data.request) {
        reservation = await standardFeeApi<StandardFeeReservation>({ action: "reserve", ...data.request });
        saveStandardFee(address, reservation);
      }
      if (!reservation) continue;
      if (data.burnHash) {
        const result = await updateStandardFeeClient(reservation, "submit", data.burnHash);
        if (result.pendingReceipt) continue;
      } else {
        // An uncertain broadcast must not be released; the server rejects its cancellation.
        await updateStandardFeeClient(reservation, "cancel");
      }
      clearStandardFee(address, id);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EXPIRED_UNRESERVED") clearStandardFee(address, id);
      // Recovery is best effort, not a wallet lock. Preserve the entry for the next attempt.
    }
  }
}

export function clearStandardFee(address: string, id: string) {
  const entries = readRecovery(address).filter(entry => recoveryId(entry) !== id);
  if (entries.length) localStorage.setItem(storageKey(address), JSON.stringify(entries));
  else localStorage.removeItem(storageKey(address));
}

/** Receipt polling is a hint; the server independently verifies the chain. */
export async function notifyStandardFeeReceipt(burnHash: string) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(storagePrefix)) continue;
    let entries: SavedStandardFee[];
    try { entries = readRecovery(key.slice(storagePrefix.length)); } catch { continue; }
    for (const data of entries) {
      if (data.reservation && data.burnHash === burnHash) {
        await updateStandardFeeClient(data.reservation, "submit", burnHash);
      }
    }
  }
}
export function previewStandardFeeClient(input: Pick<StandardFeeRequest, "address" | "sourceChainId" | "amountAtomic">) {
  return standardFeeApi<{ volumeAtomic: string; feeAtomic: string; chargeFee: boolean }>({ action: "preview", ...input });
}
