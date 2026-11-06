import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, zeroAddress, type TransactionReceipt } from "viem";
import { matchesForwardedReceipt } from "@/lib/cctp/forwardedReceipt";
const transmitter = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const recipient = "0x3333333333333333333333333333333333333333";
const nonce = `0x${"a".repeat(64)}` as const;
const body = `0x${"0".repeat(72)}${recipient.slice(2).padStart(64, "0")}${"0".repeat(200)}` as `0x${string}`;
const message = `0x00000001000000000000001a${nonce.slice(2)}${"0".repeat(208)}${body.slice(2)}` as `0x${string}`;
const received = parseAbiItem("event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const receipt = { status: "success", logs: [
 { address: transmitter, topics: encodeEventTopics({ abi: [received], eventName: "MessageReceived", args: { caller: recipient, nonce, finalityThresholdExecuted: 2000 } }), data: encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "bytes" }], [0, `0x${"0".repeat(64)}`, body]) },
 { address: token, topics: encodeEventTopics({ abi: [transfer], eventName: "Transfer", args: { from: zeroAddress, to: recipient } }), data: encodeAbiParameters([{ type: "uint256" }], [100n]) },
] } as unknown as TransactionReceipt;
describe("forwarded destination receipt", () => {
 it("accepts the matching successful CCTP mint", () => expect(matchesForwardedReceipt(receipt, message, transmitter, token, recipient)).toBe(true));
 it("rejects a reverted claim or an unrelated recipient", () => {
  expect(matchesForwardedReceipt({ ...receipt, status: "reverted" }, message, transmitter, token, recipient)).toBe(false);
  expect(matchesForwardedReceipt(receipt, message, transmitter, token, token)).toBe(false);
 });
 it("rejects a receipt without the expected CCTP event", () => expect(matchesForwardedReceipt({ ...receipt, logs: receipt.logs.slice(1) }, message, transmitter, token, recipient)).toBe(false));
});

import { utils } from "@coral-xyz/anchor";
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { matchesForwardedSolanaMint } from "@/lib/cctp/forwardedReceipt";

describe("Solana forwarded mint receipt", () => {
  const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const owner = new PublicKey(new Uint8Array(32).fill(7));
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);
  const messageBytes = new Uint8Array(376);
  messageBytes.set(ata.toBytes(), 184);
  messageBytes[247] = 100; // gross amount
  messageBytes[343] = 5; // Circle fees executed
  const solanaMessage = `0x${Buffer.from(messageBytes).toString("hex")}` as `0x${string}`;
  const receiveData = Buffer.alloc(16 + messageBytes.length + 65);
  Buffer.from("26907fe11fe1ee19", "hex").copy(receiveData);
  receiveData.writeUInt32LE(messageBytes.length, 8);
  Buffer.from(messageBytes).copy(receiveData, 12);
  receiveData.writeUInt32LE(65, 12 + messageBytes.length);
  const transaction = {
    meta: { err: null, logMessages: ["Program CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC invoke [1]"], innerInstructions: [{ instructions: [{ program: "spl-token", parsed: { type: "mintTo", info: { mint, account: ata.toBase58(), amount: "95" } } }] }] },
    transaction: { message: { instructions: [{ programId: new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"), data: utils.bytes.bs58.encode(receiveData) }] } },
  } as unknown as ParsedTransactionWithMeta;
  it("accepts CCTP execution minting the expected net amount into the encoded ATA", () => {
    expect(matchesForwardedSolanaMint(transaction, solanaMessage, mint, owner.toBase58())).toBe(true);
  });
  it("rejects another message with the same recipient and mint amount", () => {
    const unrelated = new Uint8Array(messageBytes);
    unrelated[43] = 99; // Different nonce; identical ATA, amount and executed fee.
    expect(matchesForwardedSolanaMint(transaction, `0x${Buffer.from(unrelated).toString("hex")}`, mint, owner.toBase58())).toBe(false);
  });
  it("rejects unsuccessful executions, unrelated recipients and mismatched amounts", () => {
    expect(matchesForwardedSolanaMint({ ...transaction, meta: { ...transaction.meta!, err: "failed" } }, solanaMessage, mint, owner.toBase58())).toBe(false);
    expect(matchesForwardedSolanaMint(transaction, solanaMessage, mint, new PublicKey(new Uint8Array(32).fill(8)).toBase58())).toBe(false);
    const changed = new Uint8Array(messageBytes); changed[247] = 101;
    expect(matchesForwardedSolanaMint(transaction, `0x${Buffer.from(changed).toString("hex")}`, mint, owner.toBase58())).toBe(false);
  });
});
