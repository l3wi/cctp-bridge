import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./client";
import { standardFeeAccounts as accounts, standardFeeReservations as reservations, bridgeBurnSubmissions } from "./schema";
import { quoteCumulativeFee, type StandardFeeRequest } from "@/lib/cctp/cumulativeFee";
import { getFastTransferFeeConfig } from "@/lib/cctp/fastTransferFee";
import { verifyStandardBurn } from "./verifyStandardBurn";

/** Quotes never lock a wallet; only independently verified burns affect its balance. */
export async function previewStandardFee(input: Pick<StandardFeeRequest, "address" | "sourceChainId" | "amountAtomic">) {
  const address = typeof input.sourceChainId === "number" ? input.address.toLowerCase() : input.address;
  const db = getDatabase();
  const pending = await db.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.address, address), inArray(reservations.status, ["broadcasting", "submitted"]), isNotNull(reservations.burnHash),
  )).limit(20);
  for (const reservation of pending) {
    try { await reconcileStandardFee(reservation.id); } catch { /* Unverified requests cannot block a wallet. */ }
  }
  const account = await db.query.standardFeeAccounts.findFirst({ where: eq(accounts.address, address) });
  const volume = BigInt(account?.volumeAtomic ?? 0);
  const quote = quoteCumulativeFee(volume, BigInt(account?.nextThresholdAtomic ?? 1_000_000_000_000), BigInt(input.amountAtomic));
  return { volumeAtomic: volume.toString(), feeAtomic: quote.fee.toString(), chargeFee: quote.fee > 0n };
}

export async function reconcileStandardFee(id: string) {
  const db = getDatabase();
  const r = await db.query.standardFeeReservations.findFirst({ where: eq(reservations.id, id) });
  if (!r || !["broadcasting", "submitted"].includes(r.status) || !r.burnHash) return;
  const state = await verifyStandardBurn(r);
  if (state === "pending") return;
  if (state === "received") {
    // A hash alone is not evidence it was sent: only an on-chain receipt is.
    await db.update(reservations).set({ status: "submitted" }).where(and(eq(reservations.id, id), eq(reservations.status, "broadcasting")));
    return;
  }
  await db.transaction(async tx => {
    const claimed = await tx.update(reservations).set({ status: state }).where(and(eq(reservations.id, id), inArray(reservations.status, ["broadcasting", "submitted"]))).returning();
    if (!claimed.length) return;
    await tx.update(accounts).set({
      activeReservationId: null,
      ...(state === "confirmed" ? {
        volumeAtomic: sql`${accounts.volumeAtomic} + ${r.amountAtomic}`,
        feesPaidAtomic: sql`${accounts.feesPaidAtomic} + ${r.feeAtomic}`,
        nextThresholdAtomic: r.feeAtomic > 0
          ? sql`max(${accounts.nextThresholdAtomic}, (cast((${accounts.volumeAtomic} + ${r.amountAtomic}) / 1000000000000 as integer) + 1) * 1000000000000)`
          : sql`${accounts.nextThresholdAtomic}`,
      } : {}),
    }).where(eq(accounts.address, r.address));
  });
}

export async function reserveStandardFee(input: StandardFeeRequest) {
  const db = getDatabase();
  const address = typeof input.sourceChainId === "number" ? input.address.toLowerCase() : input.address;
  // Recover an existing request before a changed balance can invalidate its amount.
  const saved = await db.query.standardFeeReservations.findFirst({ where: eq(reservations.id, input.requestId) });
  if (saved) {
    if (saved.address !== address || saved.amountAtomic !== Number(input.amountAtomic) || saved.sourceChainId !== String(input.sourceChainId) || saved.status !== "reserved") throw new Error("Fee reservation already used");
    return saved;
  }
  await previewStandardFee(input);
  const config = getFastTransferFeeConfig();
  const recipient = typeof input.sourceChainId === "number" ? config.evmRecipient : config.solanaRecipient;
  if (!recipient) throw new Error("Standard fee recipient is not configured");
  return db.transaction(async tx => {
    const previous = await tx.query.standardFeeReservations.findFirst({ where: eq(reservations.id, input.requestId) });
    if (previous) {
      if (previous.address !== address || previous.amountAtomic !== Number(input.amountAtomic) || previous.sourceChainId !== String(input.sourceChainId) || previous.status !== "reserved") throw new Error("Fee reservation already used");
      return previous;
    }
    await tx.insert(accounts).values({ address }).onConflictDoNothing();
    const account = (await tx.select().from(accounts).where(eq(accounts.address, address)))[0];
    const quote = quoteCumulativeFee(BigInt(account.volumeAtomic), BigInt(account.nextThresholdAtomic), BigInt(input.amountAtomic));
    const r = {
      id: input.requestId, token: randomUUID(), address, sourceChainId: String(input.sourceChainId),
      amountAtomic: Number(input.amountAtomic), feeAtomic: Number(quote.fee), recipient,
      nextThresholdAtomic: Number(quote.nextThreshold), status: "reserved" as const, createdAt: Date.now(),
    };
    await tx.insert(reservations).values(r);
    return r;
  });
}

export async function updateStandardFee(id: string, token: string, action: "broadcast" | "submit" | "cancel" | "rejected", burnHash?: string) {
  const db = getDatabase();
  // Do not let an unsigned request claim another transfer's hash before validation.
  if (action === "submit" && burnHash) {
    const r = await db.query.standardFeeReservations.findFirst({ where: and(eq(reservations.id, id), eq(reservations.token, token)) });
    if (!r) throw new Error("Invalid fee reservation");
    const state = await verifyStandardBurn({ ...r, burnHash });
    if (state === "pending") return r;
  }
  return db.transaction(async tx => {
    const r = (await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.token, token))))[0];
    if (!r) throw new Error("Invalid fee reservation");
    if (burnHash && !r.sourceChainId.startsWith("Solana")) burnHash = burnHash.toLowerCase();
    if (action === "submit") {
      if (r.burnHash === burnHash && ["confirmed", "failed"].includes(r.status)) return r;
      if (!burnHash || !["broadcasting", "submitted"].includes(r.status) || (r.burnHash && r.burnHash !== burnHash)) throw new Error("Invalid burn submission");
      const existing = await tx.query.standardFeeReservations.findFirst({ where: and(eq(reservations.sourceChainId, r.sourceChainId), eq(reservations.burnHash, burnHash)) });
      if (existing && existing.id !== r.id) return existing;
      const recorded = await tx.select({ submittedAt: bridgeBurnSubmissions.submittedAt }).from(bridgeBurnSubmissions).where(and(
        eq(bridgeBurnSubmissions.sourceChainId, r.sourceChainId), eq(bridgeBurnSubmissions.burnHash, burnHash),
      )).limit(1);
      if (recorded[0] && recorded[0].submittedAt.getTime() < r.createdAt) throw new Error("Cannot credit historical burns to a new reservation");
      // Persist only a hash whose receipt matches this quote.
      await tx.update(reservations).set({ burnHash }).where(eq(reservations.id, id));
      return { ...r, burnHash };
    } else if (action === "broadcast") {
      if (r.status !== "reserved") throw new Error("Reservation already used");
      await tx.update(reservations).set({ status: "broadcasting" }).where(eq(reservations.id, id));
    } else {
      // Never expire broadcasting reservations: a delayed transaction may still land.
      if (r.status === "cancelled") return r;
      if (r.status !== "reserved" && !(action === "rejected" && r.status === "broadcasting" && !r.burnHash)) throw new Error("Broadcast status must be reconciled before retrying");
      await tx.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, id));
      await tx.update(accounts).set({ activeReservationId: null }).where(eq(accounts.address, r.address));
    }
    return r;
  });
}
