import { after, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { type StandardFeeRequest } from "@/lib/cctp/cumulativeFee";
import { reserveStandardFee, updateStandardFee, reconcileStandardFee, previewStandardFee } from "@/lib/db/standardFees";
import { resolveBridgeChainUniversal } from "@/lib/metadata";
import { getDatabase } from "@/lib/db/client";
import { standardFeeReservations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "preview") {
      resolveBridgeChainUniversal(body.sourceChainId);
      if (typeof body.address !== "string" || typeof body.amountAtomic !== "string" || !/^\d{1,13}$/.test(body.amountAtomic)) throw new Error("Invalid fee preview");
      if (typeof body.sourceChainId === "number") {
        if (!/^0x[\da-f]{40}$/i.test(body.address)) throw new Error("Invalid wallet address");
      } else {
        new PublicKey(body.address);
      }
      return NextResponse.json(await previewStandardFee(body));
    }
    if (body.action === "reserve") {
      const input: StandardFeeRequest = {
        requestId: body.requestId, address: body.address, sourceChainId: body.sourceChainId,
        amountAtomic: body.amountAtomic, issuedAt: body.issuedAt,
      };
      if (!/^[\da-f-]{36}$/i.test(input.requestId) || typeof input.address !== "string" || !/^\d{1,13}$/.test(input.amountAtomic)
        || !Number.isSafeInteger(input.issuedAt)) throw new Error("Invalid fee request");
      resolveBridgeChainUniversal(input.sourceChainId);
      if (typeof input.sourceChainId === "number") {
        if (!/^0x[\da-f]{40}$/i.test(input.address)) throw new Error("Invalid wallet address");
      } else {
        new PublicKey(input.address);
      }
      if (Math.abs(Date.now() - input.issuedAt) > 300_000) {
        const previous = await getDatabase().query.standardFeeReservations.findFirst({ where: eq(standardFeeReservations.id, input.requestId) });
        if (!previous) return NextResponse.json({ error: "Fee request expired. Please retry with a fresh request.", code: "EXPIRED_UNRESERVED" }, { status: 410 });
      }
      const r = await reserveStandardFee(input);
      return NextResponse.json({ id: r.id, token: r.token, chargeFee: r.feeAtomic > 0, feeAtomic: String(r.feeAtomic), recipient: r.recipient });
    }
    if (!["broadcast", "submit", "cancel", "rejected"].includes(body.action) || typeof body.id !== "string" || typeof body.token !== "string") throw new Error("Invalid fee action");
    if (body.action === "submit" && (typeof body.burnHash !== "string" || !/^(0x[\da-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{64,88})$/.test(body.burnHash))) throw new Error("Invalid transaction hash");
    const updated = await updateStandardFee(body.id, body.token, body.action, body.burnHash);
    if (body.action === "submit") after(async () => {
      try { await reconcileStandardFee(updated.id); } catch { console.warn("Standard fee reconciliation pending", body.id); }
    });
    return NextResponse.json({ ok: true, pendingReceipt: body.action === "submit" && !updated.burnHash });
  } catch (error) {
    console.warn("Standard fee request failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to quote Standard fee" }, { status: 409 });
  }
}
