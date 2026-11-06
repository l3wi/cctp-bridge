// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters, erc20Abi, TransactionReceiptNotFoundError } from "viem";
import { BRIDGE_WITH_PREAPPROVAL_ABI, TOKEN_MESSENGER_ABI, BRIDGE_WITH_HOOK_ABI, FORWARDING_HOOK_DATA } from "@/lib/cctp/evm/burn";
import { getForwardingHookData } from "@/lib/cctp/forwarding";
import { verifyStandardBurn } from "@/lib/db/verifyStandardBurn";
import { standardFeeReservations } from "@/lib/db/schema";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { utils } from "@coral-xyz/anchor";
import { createHash } from "node:crypto";
import type * as ChainMetadata from "@/lib/metadata";

const owner = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const bridge = "0x3333333333333333333333333333333333333333";
const token = "0x4444444444444444444444444444444444444444";
const messenger = "0x5555555555555555555555555555555555555555";
const rpc = vi.hoisted(() => ({ getTransactionReceipt: vi.fn(), getTransaction: vi.fn(), getBlockNumber: vi.fn(), getBlock: vi.fn() }));
const solRpc = vi.hoisted(() => ({ getParsedTransaction: vi.fn() }));
vi.mock("@/lib/rpc/clients", () => ({ createEvmPublicClient: () => rpc, createSolanaConnection: () => solRpc }));
vi.mock("@/lib/metadata", async importOriginal => ({ ...await importOriginal<typeof ChainMetadata>(), resolveBridgeChainUniversal: (id: number | string) => ({ usdcAddress: typeof id === "string" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "0x4444444444444444444444444444444444444444", kitContracts: { bridge: "0x3333333333333333333333333333333333333333" }, cctp: { contracts: { v2: { confirmations: 2, tokenMessenger: "0x5555555555555555555555555555555555555555" } } } }) }));

const r: typeof standardFeeReservations.$inferSelect = {
  id: "id", token: "secret", address: owner, sourceChainId: "1", amountAtomic: 1_000_000_000_000,
  feeAtomic: 100_000_000, recipient, nextThresholdAtomic: 2_000_000_000_000,
  status: "submitted", burnHash: `0x${"a".repeat(64)}`, createdAt: 1_000_000, lastCheckedAt: 0,
};
const log = (from: `0x${string}`, to: `0x${string}`, value: bigint) => ({
  address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});

describe("Standard fee Solana receipt verification", () => {
  const ownerKey = Keypair.generate().publicKey;
  const feeKey = Keypair.generate().publicKey;
  const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const source = getAssociatedTokenAddressSync(mint, ownerKey);
  const destination = getAssociatedTokenAddressSync(mint, feeKey);
  const reservation = { ...r, sourceChainId: "Solana", address: ownerKey.toBase58(), recipient: feeKey.toBase58() };
  const transaction = (finality = 2000, fee = "100000000", feeDestination = destination) => {
    const data = Buffer.alloc(96);
    createHash("sha256").update("global:deposit_for_burn").digest().copy(data, 0, 0, 8);
    data.writeBigUInt64LE(999_900_000_000n, 8);
    data.writeUInt32LE(finality, 92);
    return {
      blockTime: 1001, meta: { err: null, innerInstructions: [] },
      transaction: { message: {
        accountKeys: [{ pubkey: ownerKey, signer: true }],
        instructions: [
          { programId: new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"), data: utils.bytes.bs58.encode(data), accounts: [ownerKey, source, mint] },
          { program: "spl-token", parsed: { type: "transfer", info: { source: source.toBase58(), destination: feeDestination.toBase58(), authority: ownerKey.toBase58(), amount: fee } } },
        ],
      } },
    };
  };
  it("accepts the finalized Standard burn and full fee in the same transaction", async () => {
    solRpc.getParsedTransaction.mockResolvedValue(transaction());
    expect(await verifyStandardBurn(reservation)).toBe("confirmed");
  });
  it("verifies Solana forwarding Standard instructions with the same app fee", async () => {
    const tx = transaction();
    const ix = tx.transaction.message.instructions[0];
    const base = Buffer.from(utils.bytes.bs58.decode(ix.data!));
    createHash("sha256").update("global:deposit_for_burn_with_hook").digest().copy(base, 0, 0, 8);
    base.writeUInt32LE(26, 16);
    const hook = Buffer.from(FORWARDING_HOOK_DATA.slice(2), "hex");
    const length = Buffer.alloc(4); length.writeUInt32LE(hook.length);
    ix.data = utils.bytes.bs58.encode(Buffer.concat([base, length, hook]));
    solRpc.getParsedTransaction.mockResolvedValue(tx);
    expect(await verifyStandardBurn(reservation)).toBe("confirmed");
    base[52] = 1; // A restricted destination caller prevents Circle forwarding.
    ix.data = utils.bytes.bs58.encode(Buffer.concat([base, length, hook]));
    await expect(verifyStandardBurn(reservation)).rejects.toThrow("instruction mismatch");
  });

  it("accepts a Standard fee paid to an off-curve recipient's associated token account", async () => {
    const [feePda] = PublicKey.findProgramAddressSync([Buffer.from("standard-fee")], mint);
    const feeAta = getAssociatedTokenAddressSync(mint, feePda, true);
    solRpc.getParsedTransaction.mockResolvedValue(transaction(2000, "100000000", feeAta));
    expect(await verifyStandardBurn({ ...reservation, recipient: feePda.toBase58() })).toBe("confirmed");
    solRpc.getParsedTransaction.mockResolvedValue(transaction(2000, "90000000", feeAta));
    await expect(verifyStandardBurn({ ...reservation, recipient: feePda.toBase58() })).rejects.toThrow("Fee transfer mismatch");
  });
  it("does not credit Fast burns or an incomplete fee", async () => {
    solRpc.getParsedTransaction.mockResolvedValue(transaction(1000));
    await expect(verifyStandardBurn(reservation)).rejects.toThrow("instruction mismatch");
    solRpc.getParsedTransaction.mockResolvedValue(transaction(2000, "90000000"));
    await expect(verifyStandardBurn(reservation)).rejects.toThrow("Fee transfer mismatch");
  });
  it("keeps unfinalized burns pending", async () => {
    solRpc.getParsedTransaction.mockResolvedValue(null);
    expect(await verifyStandardBurn(reservation)).toBe("pending");
  });
  it("marks a confirmed Solana receipt received without crediting it before finality", async () => {
    solRpc.getParsedTransaction.mockResolvedValueOnce(null).mockResolvedValueOnce(transaction());
    expect(await verifyStandardBurn(reservation)).toBe("received");
    expect(solRpc.getParsedTransaction).toHaveBeenLastCalledWith(reservation.burnHash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  });
});

describe("Standard fee EVM receipt verification", () => {
  beforeEach(() => {
    rpc.getBlock.mockResolvedValue({ timestamp: 1001n });
    rpc.getBlockNumber.mockResolvedValue(11n);
    rpc.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n, logs: [
      log(owner, bridge, 1_000_000_000_000n), log(bridge, recipient, 90_000_000n),
    ] });
    rpc.getTransaction.mockResolvedValue({ from: owner, to: bridge, input: encodeFunctionData({
      abi: BRIDGE_WITH_PREAPPROVAL_ABI, functionName: "bridgeWithPreapproval", args: [{
        amount: 999_900_000_000n, maxFee: 0n, fee: 100_000_000n, mintRecipient: `0x${"0".repeat(64)}`,
        destinationCaller: `0x${"0".repeat(64)}`, burnToken: token, feeRecipient: recipient,
        destinationDomain: 6, minFinalityThreshold: 2000,
      }],
    }) });
  });

  it("verifies forwarded Standard app fees and rejects an altered hook", async () => {
    const transaction = await rpc.getTransaction();
    const params = {
      amount: 999_900_000_000n, maxFee: 60_000n, fee: 100_000_000n,
      mintRecipient: `0x${"0".repeat(64)}` as `0x${string}`, destinationCaller: `0x${"0".repeat(64)}` as `0x${string}`,
      burnToken: token as `0x${string}`, feeRecipient: recipient as `0x${string}`, destinationDomain: 26, minFinalityThreshold: 2000,
    };
    const input = (hookData: `0x${string}`) => encodeFunctionData({ abi: BRIDGE_WITH_HOOK_ABI, functionName: "bridgeWithPreapprovalAndHook", args: [params, hookData] });
    rpc.getTransaction.mockResolvedValue({ ...transaction, input: input(FORWARDING_HOOK_DATA) });
    expect(await verifyStandardBurn(r)).toBe("confirmed");
    rpc.getTransaction.mockResolvedValue({ ...transaction, input: input("0x1234") });
    await expect(verifyStandardBurn(r)).rejects.toThrow("Forwarding hook mismatch");
    rpc.getTransaction.mockResolvedValue({ ...transaction, input: input(FORWARDING_HOOK_DATA) });
    rpc.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n, logs: [log(owner, bridge, 1_000_000_000_000n)] });
    await expect(verifyStandardBurn(r)).rejects.toThrow("Fee receipt mismatch");
  });
  it("verifies Solana ATA-creation hook ownership against the EVM burn recipient", async () => {
    const transaction = await rpc.getTransaction();
    const wallet = Keypair.generate().publicKey;
    const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const ata = getAssociatedTokenAddressSync(mint, wallet);
    const hookData = getForwardingHookData("Solana", wallet.toBase58());
    const input = (mintRecipient: `0x${string}`) => encodeFunctionData({ abi: BRIDGE_WITH_HOOK_ABI, functionName: "bridgeWithPreapprovalAndHook", args: [{
      amount: 999_900_000_000n, maxFee: 60_000n, fee: 100_000_000n,
      mintRecipient, destinationCaller: `0x${"0".repeat(64)}`,
      burnToken: token, feeRecipient: recipient, destinationDomain: 5, minFinalityThreshold: 2000,
    }, hookData] });
    rpc.getTransaction.mockResolvedValue({ ...transaction, input: input(`0x${ata.toBuffer().toString("hex")}`) });
    expect(await verifyStandardBurn(r)).toBe("confirmed");
    rpc.getTransaction.mockResolvedValue({ ...transaction, input: input(`0x${"0".repeat(64)}`) });
    await expect(verifyStandardBurn(r)).rejects.toThrow("Forwarding hook mismatch");
  });

  it("credits the full 100 USDC user fee when Circle sends 90 USDC to the recipient", async () => {
    expect(await verifyStandardBurn(r)).toBe("confirmed");
  });
  it("credits a zero-fee Standard burn sent directly to the token messenger", async () => {
    const free = { ...r, amountAtomic: 900_000_000_000, feeAtomic: 0 };
    rpc.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n, logs: [
      log(owner, "0x0000000000000000000000000000000000000000", BigInt(free.amountAtomic)),
    ] });
    rpc.getTransaction.mockResolvedValue({ from: owner, to: messenger, input: encodeFunctionData({
      abi: TOKEN_MESSENGER_ABI, functionName: "depositForBurn",
      args: [BigInt(free.amountAtomic), 6, `0x${"0".repeat(64)}`, token, `0x${"0".repeat(64)}`, 0n, 2000],
    }) });
    expect(await verifyStandardBurn(free)).toBe("confirmed");
  });
  it("rejects another wallet before accepting an unfinalized receipt", async () => {
    rpc.getBlockNumber.mockResolvedValue(10n);
    rpc.getTransaction.mockResolvedValue({ from: recipient });
    await expect(verifyStandardBurn(r)).rejects.toThrow("signer mismatch");
  });
  it("waits for Standard confirmations", async () => {
    rpc.getBlockNumber.mockResolvedValue(10n);
    expect(await verifyStandardBurn(r)).toBe("received");
  });
  it("does not mark a hash sent when its receipt is not found", async () => {
    rpc.getTransactionReceipt.mockRejectedValue(new TransactionReceiptNotFoundError({ hash: r.burnHash as `0x${string}` }));
    expect(await verifyStandardBurn(r)).toBe("pending");
  });
  it("does not credit reverted transactions", async () => {
    rpc.getTransactionReceipt.mockResolvedValue({ status: "reverted", blockNumber: 10n });
    expect(await verifyStandardBurn(r)).toBe("failed");
  });
  it("rejects missing fee transfers even when the calldata claimed a fee", async () => {
    rpc.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n, logs: [log(owner, bridge, 1_000_000_000_000n)] });
    await expect(verifyStandardBurn(r)).rejects.toThrow("Fee receipt mismatch");
  });
  it("rejects another wallet's transaction and historical receipts", async () => {
    rpc.getTransaction.mockResolvedValue({ from: recipient });
    await expect(verifyStandardBurn(r)).rejects.toThrow("signer mismatch");
    rpc.getBlock.mockResolvedValue({ timestamp: 1n });
    await expect(verifyStandardBurn(r)).rejects.toThrow("predates");
  });
});
