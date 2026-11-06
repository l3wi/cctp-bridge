import { decodeFunctionData, erc20Abi, parseEventLogs, TransactionReceiptNotFoundError } from "viem";
import { utils } from "@coral-xyz/anchor";
import { createHash } from "node:crypto";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createEvmPublicClient, createSolanaConnection } from "@/lib/rpc/clients";
import { getAllSupportedChains } from "@/lib/bridgeConfig";
import { resolveBridgeChainUniversal } from "@/lib/metadata";
import { BRIDGE_WITH_PREAPPROVAL_ABI, TOKEN_MESSENGER_ABI, BRIDGE_WITH_HOOK_ABI, TOKEN_MESSENGER_WITH_HOOK_ABI, FORWARDING_HOOK_DATA } from "@/lib/cctp/evm/burn";
import { standardFeeReservations } from "./schema";

/** Verify Circle's forwarding frame against the destination domain and actual mint recipient. */
function validForwardingHook(hook: string, domain: number, mintRecipient: string, isTestnet: boolean): boolean {
  const destination = getAllSupportedChains(isTestnet ? "testnet" : "mainnet").find(c => c.cctp?.domain === domain);
  if (!destination?.cctp?.forwarderSupported?.destination) return false;
  if (destination.type !== "solana") return hook.toLowerCase() === FORWARDING_HOOK_DATA;
  // Solana forwarding requests ATA creation for its encoded owner.
  if (!/^0x[0-9a-f]{130}$/i.test(hook) || hook.slice(0, 58).toLowerCase() !== FORWARDING_HOOK_DATA.slice(0, 58) || hook.slice(58, 68).toLowerCase() !== "0000002101") return false;
  try {
    const owner = new PublicKey(Buffer.from(hook.slice(68), "hex"));
    const ata = getAssociatedTokenAddressSync(new PublicKey(destination.usdcAddress!), owner, true);
    return `0x${Buffer.from(ata.toBytes()).toString("hex")}`.toLowerCase() === mintRecipient.toLowerCase();
  } catch { return false; }
}

type Reservation = typeof standardFeeReservations.$inferSelect;

/** Missing or uncertain receipts never release a pending charge. */
export async function verifyStandardBurn(r: Reservation): Promise<"confirmed" | "failed" | "pending" | "received"> {
  if (!r.burnHash) return "pending";
  const amount = BigInt(r.amountAtomic - r.feeAtomic);
  if (r.sourceChainId === "Solana" || r.sourceChainId === "Solana_Devnet") {
    const metadata = resolveBridgeChainUniversal(r.sourceChainId);
    const connection = createSolanaConnection(r.sourceChainId, "finalized");
    let tx = await connection.getParsedTransaction(r.burnHash, {
      commitment: "finalized", maxSupportedTransactionVersion: 0,
    });
    const finalized = !!tx?.meta;
    if (!finalized) {
      tx = await connection.getParsedTransaction(r.burnHash, {
        commitment: "confirmed", maxSupportedTransactionVersion: 0,
      });
    }
    if (!tx?.meta) return "pending";
    if (!tx.blockTime || tx.blockTime * 1000 < r.createdAt - 60_000) throw new Error("Burn predates reservation");
    const owner = tx.transaction.message.accountKeys.find(k => k.pubkey.toBase58() === r.address);
    if (!owner?.signer || !metadata.usdcAddress) throw new Error("Burn signer mismatch");
    if (tx.meta.err) return finalized ? "failed" : "received";
    const mint = new PublicKey(metadata.usdcAddress);
    const source = getAssociatedTokenAddressSync(mint, new PublicKey(r.address)).toBase58();
    const recipient = getAssociatedTokenAddressSync(mint, new PublicKey(r.recipient), true).toBase58();
    const discriminator = createHash("sha256").update("global:deposit_for_burn").digest().subarray(0, 8);
    const hookDiscriminator = createHash("sha256").update("global:deposit_for_burn_with_hook").digest().subarray(0, 8);
    const burns = tx.transaction.message.instructions.filter(ix => {
      if (!("data" in ix) || ix.programId.toBase58() !== "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe") return false;
      const data = Buffer.from(utils.bytes.bs58.decode(ix.data));
      const plain = data.length === 96 && data.subarray(0, 8).equals(discriminator);
      const hooked = data.length >= 100 && data.subarray(0, 8).equals(hookDiscriminator)
        && data.readUInt32LE(96) === data.length - 100
        && data.subarray(52, 84).equals(Buffer.alloc(32))
        && validForwardingHook(`0x${data.subarray(100).toString("hex")}`, data.readUInt32LE(16), `0x${data.subarray(20, 52).toString("hex")}`, r.sourceChainId === "Solana_Devnet");
      return (plain || hooked)
        && data.readBigUInt64LE(8) === amount && data.readUInt32LE(92) === 2000
        && ix.accounts.some(a => a.toBase58() === source)
        && ix.accounts.some(a => a.equals(mint));
    });
    if (burns.length !== 1) throw new Error("Standard burn instruction mismatch");
    const instructions = [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap(i => i.instructions)];
    const fees = instructions.reduce((sum, ix) => {
      if (!("parsed" in ix) || ix.program !== "spl-token") return sum;
      const { type, info } = ix.parsed;
      if (!["transfer", "transferChecked"].includes(type) || info.source !== source || info.destination !== recipient || info.authority !== r.address) return sum;
      return sum + BigInt(info.amount ?? info.tokenAmount?.amount ?? "0");
    }, 0n);
    if (fees !== BigInt(r.feeAtomic)) throw new Error("Fee transfer mismatch");
    return finalized ? "confirmed" : "received";
  }

  const chainId = Number(r.sourceChainId);
  const chain = resolveBridgeChainUniversal(chainId);
  const client = createEvmPublicClient(chainId);
  const hash = r.burnHash as `0x${string}`;
  const receipt = await client.getTransactionReceipt({ hash }).catch(error => {
    if (error instanceof TransactionReceiptNotFoundError) return null;
    throw error;
  });
  if (!receipt) return "pending";
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (Number(block.timestamp) * 1000 < r.createdAt - 60_000) throw new Error("Burn predates reservation");
  // Respect the source chain's Standard confirmation depth before crediting.
  const confirmations = BigInt(chain.cctp?.contracts?.v2?.confirmations ?? 1);
  const finalized = (await client.getBlockNumber()) - receipt.blockNumber + 1n >= confirmations;
  const tx = await client.getTransaction({ hash });
  if (tx.from.toLowerCase() !== r.address) throw new Error("Burn signer mismatch");
  if (receipt.status === "reverted") return finalized ? "failed" : "received";
  let burnAmount: bigint;
  let burnToken: string;
  let finality: number;
  if (r.feeAtomic > 0) {
    if (tx.to?.toLowerCase() !== chain.kitContracts?.bridge?.toLowerCase()) throw new Error("Bridge contract mismatch");
    const { args, functionName } = decodeFunctionData({ abi: [...BRIDGE_WITH_PREAPPROVAL_ABI, ...BRIDGE_WITH_HOOK_ABI], data: tx.input });
    if (functionName === "bridgeWithPreapprovalAndHook" && (!validForwardingHook(args[1]!, args[0].destinationDomain, args[0].mintRecipient, Boolean(chain.isTestnet)) || args[0].destinationCaller !== `0x${"0".repeat(64)}`)) throw new Error("Forwarding hook mismatch");
    const params = args[0];
    if (params.fee !== BigInt(r.feeAtomic) || params.feeRecipient.toLowerCase() !== r.recipient.toLowerCase()) throw new Error("Fee calldata mismatch");
    burnAmount = params.amount; burnToken = params.burnToken; finality = params.minFinalityThreshold;
  } else {
    if (tx.to?.toLowerCase() !== chain.cctp?.contracts?.v2?.tokenMessenger?.toLowerCase()) throw new Error("Token messenger mismatch");
    const { args, functionName } = decodeFunctionData({ abi: [...TOKEN_MESSENGER_ABI, ...TOKEN_MESSENGER_WITH_HOOK_ABI], data: tx.input });
    if (functionName === "depositForBurnWithHook" && (!validForwardingHook(args[7]!, args[1], args[2], Boolean(chain.isTestnet)) || args[4] !== `0x${"0".repeat(64)}`)) throw new Error("Forwarding hook mismatch");
    burnAmount = args[0]; burnToken = args[3]; finality = args[6];
  }
  if (burnAmount !== amount || burnToken.toLowerCase() !== chain.usdcAddress?.toLowerCase() || finality !== 2000) throw new Error("Standard burn calldata mismatch");
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs.filter(l => l.address.toLowerCase() === burnToken.toLowerCase()) });
  const paid = transfers.filter(l => l.args.to.toLowerCase() === r.recipient.toLowerCase()).reduce((sum, l) => sum + l.args.value, 0n);
  const debit = transfers.reduce((sum, l) => sum
    + (l.args.from.toLowerCase() === r.address ? l.args.value : 0n)
    - (l.args.to.toLowerCase() === r.address ? l.args.value : 0n), 0n);
  // Circle's bridge retains 10% of custom EVM fees; the user pays the full fee.
  if (paid !== BigInt(r.feeAtomic) * 90n / 100n || debit !== BigInt(r.amountAtomic)) throw new Error("Fee receipt mismatch");
  return finalized ? "confirmed" : "received";
}
