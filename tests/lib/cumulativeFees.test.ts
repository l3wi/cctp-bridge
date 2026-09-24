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

  it("recovers a saved small quote after another transfer makes a fee due", async () => {
    const input = request(1_000_000n);
    const saved = await reserveStandardFee(input);
    await client.execute({ sql: "UPDATE standard_fee_accounts SET volume_atomic = ?", args: [Number(M)] });
    expect(await reserveStandardFee(input)).toMatchObject(saved);
  });

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

  it("allows independent reservations, replays safely, and credits a receipt once", async () => {
    const input = request();
    const r = await reserveStandardFee(input);
    expect(await reserveStandardFee(input)).toMatchObject(r);
    expect((await reserveStandardFee(request())).id).not.toBe(r.id);
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

  it("allows new requests during uncertain burns and does not credit reverted burns", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xfail");
    verifyBurn.mockResolvedValue("pending");
    expect((await reserveStandardFee(request())).id).not.toBe(r.id);
    verifyBurn.mockResolvedValue("failed");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: null });
    expect((await reserveStandardFee(request())).feeAtomic).toBe(Number(F));
  });

  it("marks sent only on receipt, and credits only after final verification", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    verifyBurn.mockResolvedValue("pending");
    await updateStandardFee(r.id, r.token, "submit", "0xreceipt");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeReservations.findFirst()).toMatchObject({ status: "broadcasting", burnHash: null });
    verifyBurn.mockResolvedValue("received");
    await updateStandardFee(r.id, r.token, "submit", "0xreceipt");
    await reconcileStandardFee(r.id);
    expect(await db.query.standardFeeReservations.findFirst()).toMatchObject({ status: "submitted" });
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: null });
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

  it("quotes confirmed volume while another burn remains unsettled", async () => {
    const r = await reserveStandardFee(request());
    await updateStandardFee(r.id, r.token, "broadcast");
    await updateStandardFee(r.id, r.token, "submit", "0xpending");
    verifyBurn.mockResolvedValue("pending");
    expect(await previewStandardFee(request(1_000_000n))).toEqual({ volumeAtomic: "0", feeAtomic: "0", chargeFee: false });
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0, activeReservationId: null });
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

  it("does not let another caller block a wallet by reserving and never sending", async () => {
    const abandoned = await reserveStandardFee(request());
    await updateStandardFee(abandoned.id, abandoned.token, "broadcast");
    expect(await previewStandardFee(request())).toEqual({ volumeAtomic: "0", feeAtomic: String(F), chargeFee: true });
    expect((await reserveStandardFee(request())).id).not.toBe(abandoned.id);
    expect(verifyBurn).not.toHaveBeenCalled();
  });

  it("does not let an invalid submitted receipt block the next quote", async () => {
    const attacker = await reserveStandardFee(request());
    await updateStandardFee(attacker.id, attacker.token, "broadcast");
    verifyBurn.mockRejectedValue(new Error("Burn signer mismatch"));
    await expect(updateStandardFee(attacker.id, attacker.token, "submit", "0xinvalid")).rejects.toThrow("Burn signer mismatch");
    expect(await previewStandardFee(request())).toEqual({ volumeAtomic: "0", feeAtomic: String(F), chargeFee: true });
    expect((await reserveStandardFee(request())).id).not.toBe(attacker.id);
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0 });
  });

  it("credits the same verified transaction only once across different reservations", async () => {
    const first = await reserveStandardFee(request());
    const second = await reserveStandardFee(request());
    for (const reservation of [first, second]) {
      await updateStandardFee(reservation.id, reservation.token, "broadcast");
      await updateStandardFee(reservation.id, reservation.token, "submit", "0xduplicate");
    }
    await reconcileStandardFee(first.id);
    await reconcileStandardFee(second.id);
    await reconcileStandardFee(second.id);
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: Number(M), feesPaidAtomic: Number(F), nextThresholdAtomic: Number(2n * M) });
  });

  it("does not let an invalid reservation claim the hash before its valid owner", async () => {
    const attacker = await reserveStandardFee(request(M, "0x3333333333333333333333333333333333333333"));
    const legitimate = await reserveStandardFee(request());
    verifyBurn.mockImplementation(async reservation => {
      if (reservation.address !== address) throw new Error("Burn signer mismatch");
      return "confirmed";
    });
    await updateStandardFee(attacker.id, attacker.token, "broadcast");
    await expect(updateStandardFee(attacker.id, attacker.token, "submit", "0xshared")).rejects.toThrow("Burn signer mismatch");
    await updateStandardFee(legitimate.id, legitimate.token, "broadcast");
    await updateStandardFee(legitimate.id, legitimate.token, "submit", "0xshared");
    await previewStandardFee(request(M, attacker.address));
    await reconcileStandardFee(legitimate.id);
    const accounts = await db.select().from(schema.standardFeeAccounts);
    expect(accounts.find(account => account.address === address)).toMatchObject({ volumeAtomic: Number(M), feesPaidAtomic: Number(F) });
    expect(accounts.find(account => account.address === attacker.address)).toMatchObject({ volumeAtomic: 0, feesPaidAtomic: 0 });
  });

  it("keeps thresholds monotonic when old zero-fee and paid quotes settle out of order", async () => {
    const zeroFee = await reserveStandardFee(request(M / 2n));
    const olderPaid = await reserveStandardFee(request());
    const newerPaid = await reserveStandardFee(request());
    expect(zeroFee.feeAtomic).toBe(0);
    for (const [reservation, hash] of [[newerPaid, "0xnewer"], [zeroFee, "0xzero"], [olderPaid, "0xolder"]] as const) {
      await updateStandardFee(reservation.id, reservation.token, "broadcast");
      await updateStandardFee(reservation.id, reservation.token, "submit", hash);
      await reconcileStandardFee(reservation.id);
      const account = await db.query.standardFeeAccounts.findFirst();
      expect(account!.nextThresholdAtomic).toBeGreaterThanOrEqual(Number(2n * M));
    }
    expect(await db.query.standardFeeAccounts.findFirst()).toMatchObject({ volumeAtomic: Number(5n * M / 2n), feesPaidAtomic: Number(2n * F), nextThresholdAtomic: Number(3n * M) });
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
