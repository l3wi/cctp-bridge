// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as schema from "@/lib/db/schema";
import { quoteCumulativeFee, STANDARD_VOLUME_BAND as M, STANDARD_BAND_FEE as F } from "@/lib/cctp/cumulativeFee";
import { reserveStandardFee, updateStandardFee, reconcileStandardFee, previewStandardFee } from "@/lib/db/standardFees";

let client: Client;
let directory: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
const verifyBurn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ getDatabase: () => db }));
vi.mock("@/lib/db/verifyStandardBurn", () => ({ verifyStandardBurn: verifyBurn }));
vi.mock("@/lib/cctp/fastTransferFee", () => ({ getFastTransferFeeConfig: () => ({ evmRecipient: "0x2222222222222222222222222222222222222222", solanaRecipient: "11111111111111111111111111111111" }) }));

const address = "0x1111111111111111111111111111111111111111";
const request = (amount = M, owner = address) => ({ requestId: randomUUID(), address: owner, sourceChainId: 1, amountAtomic: String(amount), issuedAt: Date.now() });

describe("cumulative Standard billing", () => {
  beforeEach(async () => {
    directory = mkdtempSync(`${process.cwd()}/.fee-test-`);
    client = createClient({ url: `file:${directory}/test.db` });
    db = drizzle({ client, schema });
    await client.execute("CREATE TABLE bridge_burn_submissions (from_address TEXT, source_chain_id TEXT, transfer_type TEXT, amount_atomic INTEGER, burn_hash TEXT, submitted_at INTEGER)");
    verifyBurn.mockReset().mockResolvedValue("confirmed");
    for (const statement of readFileSync("drizzle/0003_equal_doctor_spectrum.sql", "utf8").split("--> statement-breakpoint")) {
      await client.execute(statement);
    }
  });
  afterEach(() => { client.close(); rmSync(directory, { recursive: true }); });

  it("charges an imported whale only once, then waits for the next million boundary", () => {
    const first = quoteCumulativeFee(18n * M + M / 2n, M, M / 10n);
    expect(first).toEqual({ fee: F, nextThreshold: 19n * M });
    expect(quoteCumulativeFee(18n * M + 6n * M / 10n, first.nextThreshold, M / 10n).fee).toBe(0n);
    expect(quoteCumulativeFee(18n * M + 6n * M / 10n, first.nextThreshold, 4n * M / 10n).fee).toBe(F);
    expect(() => quoteCumulativeFee(18n * M, M, F)).toThrow("Increase");
  });

  it("charges exactly at the cumulative threshold, including multiple smaller bridges", async () => {
    const first = await reserveStandardFee(request(900_000_000_000n));
    expect(first.feeAtomic).toBe(0);
    await updateStandardFee(first.id, first.token, "broadcast");
    await updateStandardFee(first.id, first.token, "submit", "0xfirst");
    await reconcileStandardFee(first.id);
    const next = await reserveStandardFee(request(100_000_000_000n));
    expect(next.feeAtomic).toBe(Number(F));
  });

  it("prevents a second reservation, replays safely, and credits a receipt once", async () => {
    const input = request();
    const r = await reserveStandardFee(input);
    expect(await reserveStandardFee(input)).toMatchObject(r);
    await expect(reserveStandardFee(request())).rejects.toThrow("awaiting confirmation");
    await updateStandardFee(r.id, r.token, "broadcast");
    await expect(updateStandardFee(r.id, r.token, "cancel")).rejects.toThrow("reconciled");
    await updateStandardFee(r.id, r.token, "submit", "0xpaid");
    await reconcileStandardFee(r.id);
    await updateStandardFee(r.id, r.token, "submit", "0xpaid");
    await reconcileStandardFee(r.id);
    const a = await db.query.standardFeeAccounts.findFirst();
    expect(a).toMatchObject({ volumeAtomic: Number(M), feesPaidAtomic: Number(F), nextThresholdAtomic: Number(2n * M), activeReservationId: null });
    expect((await reserveStandardFee(request(1_000_000n))).feeAtomic).toBe(0);
  });

  it("keeps uncertain burns locked and does not credit reverted burns", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xfail");
    verifyBurn.mockResolvedValue("pending");
    await expect(reserveStandardFee(request())).rejects.toThrow("awaiting confirmation");
    verifyBurn.mockResolvedValue("failed");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: null });
    expect((await reserveStandardFee(request())).feeAtomic).toBe(Number(F));
  });

  it("marks sent only on receipt, and credits only after final verification", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xreceipt");
    verifyBurn.mockResolvedValue("pending");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeReservations.findFirst()).toMatchObject({ status: "broadcasting", burnHash: "0xreceipt" });
    verifyBurn.mockResolvedValue("received");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeReservations.findFirst()).toMatchObject({ status: "submitted" });
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: r.id });
    verifyBurn.mockResolvedValue("confirmed");
    await reconcileStandardFee(r.id);
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: Number(M), feesPaidAtomic: Number(F), activeReservationId: null });
  });

  it("reconciles a paid burn before previewing even a sub-100 USDC transfer", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xpaid");
    expect(await previewStandardFee(request(1_000_000n))).toEqual({ volumeAtomic: String(M), feeAtomic: "0", chargeFee: false });
  });

  it("blocks previews of unsettled burns instead of displaying a stale fee", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xpending");
    verifyBurn.mockResolvedValue("pending");
    await expect(previewStandardFee(request(1_000_000n))).rejects.toThrow("awaiting confirmation");
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: r.id });
  });

  it("releases a reverted burn before quoting the fee still owed", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xfailed");
    verifyBurn.mockResolvedValue("failed");
    expect(await previewStandardFee(request())).toEqual({ volumeAtomic: "0", feeAtomic: String(F), chargeFee: true });
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ activeReservationId: null, feesPaidAtomic: 0 });
  });

  it("allows cancellation before sending and after an explicit wallet rejection", async () => {
    const r = await reserveStandardFee(request());
    await expect(updateStandardFee(r.id, "wrong-token", "cancel")).rejects.toThrow("Invalid");
    await updateStandardFee(r.id, r.token, "cancel");
    const second = await reserveStandardFee(request());
    await updateStandardFee(second.id, second.token, "broadcast");
    await updateStandardFee(second.id, second.token, "rejected");
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, activeReservationId: null });
  });

  it("imports only Standard history, combining EVM casing and preserving Solana casing", async () => {
    await client.execute("DELETE FROM standard_fee_accounts");
    const mixed = "0xAbCd000000000000000000000000000000000000";
    await client.batch([
      { sql: "INSERT INTO bridge_burn_submissions VALUES (?, ?, ?, ?, NULL, NULL)", args: [mixed, "1", "standard", Number(M)] },
      { sql: "INSERT INTO bridge_burn_submissions VALUES (?, ?, ?, ?, NULL, NULL)", args: [mixed.toLowerCase(), "8453", "standard", Number(M)] },
      { sql: "INSERT INTO bridge_burn_submissions VALUES (?, ?, ?, ?, NULL, NULL)", args: [mixed, "1", "fast", Number(M)] },
      { sql: "INSERT INTO bridge_burn_submissions VALUES (?, ?, ?, ?, NULL, NULL)", args: ["AbCd", "Solana", "standard", 500] },
      { sql: "INSERT INTO bridge_burn_submissions VALUES (?, ?, ?, ?, NULL, NULL)", args: ["abcd", "Solana", "standard", 700] },
    ], "write");
    const statements = readFileSync("drizzle/0003_equal_doctor_spectrum.sql", "utf8").split("--> statement-breakpoint");
    await client.execute(statements.at(-1)!);
    const rows = await db.select().from(schema.standardFeeAccounts);
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.address === mixed.toLowerCase())).toMatchObject({ volumeAtomic: Number(2n * M), nextThresholdAtomic: Number(M), feesPaidAtomic: 0 });
  });
});
