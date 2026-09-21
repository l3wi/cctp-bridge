import { decodeFunctionData, erc20Abi, parseEventLogs, TransactionReceiptNotFoundError } from "viem";
import { utils } from "@coral-xyz/anchor";
import { createHash } from "node:crypto";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createEvmPublicClient, createSolanaConnection } from "@/lib/rpc/clients";
import { resolveBridgeChainUniversal } from "@/lib/metadata";
import { BRIDGE_WITH_PREAPPROVAL_ABI, TOKEN_MESSENGER_ABI } from "@/lib/cctp/evm/burn";
import { standardFeeReservations } from "./schema";

type Reservation = typeof standardFeeReservations.$inferSelect;

/** Missing or uncertain receipts never release a pending charge. */
export async function verifyStandardBurn(r: Reservation): Promise<"confirmed" | "failed" | "pending" | "received"> {
  if (!r.burnHash) return "pending";
  const amount = BigInt(r.amountAtomic - r.feeAtomic);
  if (r.sourceChainId === "Solana" || r.sourceChainId === "Solana_Devnet") {
    const metadata = resolveBridgeChainUniversal(r.sourceChainId);
    const connection = createSolanaConnection(r.sourceChainId, "finalized");
    const tx = await connection.getParsedTransaction(r.burnHash, {
      commitment: "finalized", maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta) {
      const received = await connection.getParsedTransaction(r.burnHash, {
        commitment: "confirmed", maxSupportedTransactionVersion: 0,
      });
      // Record receipt arrival, but never credit until the finalized read above succeeds.
      return received?.meta ? "received" : "pending";
    }
    if (!tx.blockTime || tx.blockTime * 1000 < r.createdAt - 60_000) throw new Error("Burn predates reservation");
    if (tx.meta.err) return "failed";
    const owner = tx.transaction.message.accountKeys.find(k => k.pubkey.toBase58() === r.address);
    if (!owner?.signer || !metadata.usdcAddress) throw new Error("Burn signer mismatch");
    const mint = new PublicKey(metadata.usdcAddress);
    const source = getAssociatedTokenAddressSync(mint, new PublicKey(r.address)).toBase58();
    const recipient = getAssociatedTokenAddressSync(mint, new PublicKey(r.recipient)).toBase58();
    const discriminator = createHash("sha256").update("global:deposit_for_burn").digest().subarray(0, 8);
    const burns = tx.transaction.message.instructions.filter(ix => {
      if (!("data" in ix) || ix.programId.toBase58() !== "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe") return false;
      const data = Buffer.from(utils.bytes.bs58.decode(ix.data));
      return data.length === 96 && data.subarray(0, 8).equals(discriminator)
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
    return "confirmed";
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
  if ((await client.getBlockNumber()) - receipt.blockNumber + 1n < confirmations) return "received";
  if (receipt.status === "reverted") return "failed";
  const tx = await client.getTransaction({ hash });
  if (tx.from.toLowerCase() !== r.address) throw new Error("Burn signer mismatch");
  let burnAmount: bigint;
  let burnToken: string;
  let finality: number;
  if (r.feeAtomic > 0) {
    if (tx.to?.toLowerCase() !== chain.kitContracts?.bridge?.toLowerCase()) throw new Error("Bridge contract mismatch");
    const { args } = decodeFunctionData({ abi: BRIDGE_WITH_PREAPPROVAL_ABI, data: tx.input });
    const params = args[0];
    if (params.fee !== BigInt(r.feeAtomic) || params.feeRecipient.toLowerCase() !== r.recipient.toLowerCase()) throw new Error("Fee calldata mismatch");
    burnAmount = params.amount; burnToken = params.burnToken; finality = params.minFinalityThreshold;
  } else {
    if (tx.to?.toLowerCase() !== chain.cctp?.contracts?.v2?.tokenMessenger?.toLowerCase()) throw new Error("Token messenger mismatch");
    const { args } = decodeFunctionData({ abi: TOKEN_MESSENGER_ABI, data: tx.input });
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
  return "confirmed";
}
