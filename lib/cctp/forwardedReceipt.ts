import { utils } from "@coral-xyz/anchor";
import { erc20Abi, parseAbiItem, parseEventLogs, type TransactionReceipt, zeroAddress } from "viem";
import { resolveBridgeChainUniversal } from "@/lib/bridgeConfig";
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { type ChainId, isSolanaChain } from "@/lib/types";
import { checkNonceUsed } from "@/lib/cctp/nonce";
import { createSolanaConnection, createEvmPublicClient } from "@/lib/rpc/clients";
import { extractNonceFromMessage, extractSourceDomainFromMessage } from "@/lib/simulation";

const receivedAbi = [parseAbiItem("event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)")];
// Arc emits USDC transfers through its protocol system emitter.
const ARC_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe";

export function matchesForwardedReceipt(receipt: TransactionReceipt, message: `0x${string}`, transmitter: string, token: string, recipient: string, arcEmitter = false): boolean {
  if (receipt.status !== "success" || !/^0x[0-9a-f]{40}$/i.test(recipient)) return false;
  const encodedRecipient = message.slice(2 + 184 * 2, 2 + 216 * 2);
  if (encodedRecipient.toLowerCase() !== recipient.slice(2).toLowerCase().padStart(64, "0")) return false;
  const nonce = extractNonceFromMessage(message);
  const sourceDomain = extractSourceDomainFromMessage(message);
  const received = parseEventLogs({ abi: receivedAbi, logs: receipt.logs.filter(l => l.address.toLowerCase() === transmitter.toLowerCase()) });
  if (!received.some(l => l.args.nonce.toLowerCase() === nonce.toLowerCase() && l.args.sourceDomain === sourceDomain && l.args.messageBody.toLowerCase() === `0x${message.slice(298)}`.toLowerCase())) return false;
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs.filter(l => [token.toLowerCase(), ...(arcEmitter ? [ARC_EMITTER] : [])].includes(l.address.toLowerCase())) });
  return transfers.some(l => l.args.from === zeroAddress && l.args.to.toLowerCase() === recipient.toLowerCase() && l.args.value > 0n);
}

export async function verifyForwardedMint(destinationChainId: ChainId, hash: string, message: `0x${string}`, recipient: string): Promise<boolean> {
  const chain = resolveBridgeChainUniversal(destinationChainId);
  if (isSolanaChain(destinationChainId)) {
    if (!chain.usdcAddress) return false;
    const transaction = await createSolanaConnection(destinationChainId).getParsedTransaction(hash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!transaction || !matchesForwardedSolanaMint(transaction, message, chain.usdcAddress, recipient)) return false;
    const nonce = await checkNonceUsed(destinationChainId, message);
    return nonce.isUsed && !nonce.error;
  }
  const transmitter = chain.cctp?.contracts?.v2?.messageTransmitter;
  if (!transmitter || !chain.usdcAddress) return false;
  const receipt = await createEvmPublicClient(destinationChainId).getTransactionReceipt({ hash: hash as `0x${string}` });
  return matchesForwardedReceipt(receipt, message, transmitter, chain.usdcAddress, recipient, destinationChainId === 5042 || destinationChainId === 5042002);
}


/** Verify the intended ATA mint and CCTP invocation in a confirmed Solana transaction. */
export function matchesForwardedSolanaMint(transaction: ParsedTransactionWithMeta, message: `0x${string}`, mint: string, recipient: string): boolean {
  if (!transaction.meta || transaction.meta.err) return false;
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(recipient), true);
  const encodedRecipient = Buffer.from(ata.toBytes()).toString("hex");
  if (message.slice(370, 434).toLowerCase() !== encodedRecipient) return false;
  const amount = BigInt(`0x${message.slice(434, 498)}`);
  const fee = BigInt(`0x${message.slice(626, 690)}`);
  const net = amount - fee;
  if (net <= 0n) return false;
  const instructions = [...transaction.transaction.message.instructions, ...(transaction.meta.innerInstructions ?? []).flatMap(group => group.instructions)];
  const consumedMessage = instructions.some(instruction => {
    if (!("data" in instruction) || instruction.programId.toBase58() !== "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC") return false;
    try {
      const data = Buffer.from(utils.bytes.bs58.decode(instruction.data));
      if (data.length < 16 || data.subarray(0, 8).toString("hex") !== "26907fe11fe1ee19") return false;
      const length = data.readUInt32LE(8);
      if (length < 148 || data.length < 16 + length) return false;
      const attestationLength = data.readUInt32LE(12 + length);
      return data.length === 16 + length + attestationLength && data.subarray(12, 12 + length).toString("hex") === message.slice(2).toLowerCase();
    } catch { return false; }
  });
  if (!consumedMessage) return false;
  const invokedCctp = transaction.meta.logMessages?.some(log => log === "Program CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC invoke [1]" || /^Program CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC invoke \[\d+\]$/.test(log));
  if (!invokedCctp) return false;
  return instructions.some(instruction => {
    if (!("parsed" in instruction) || instruction.program !== "spl-token") return false;
    const parsed = instruction.parsed as { type?: string; info?: { mint?: string; account?: string; amount?: string; tokenAmount?: { amount?: string } } };
    return (parsed.type === "mintTo" || parsed.type === "mintToChecked") && parsed.info?.mint === mint && parsed.info?.account === ata.toBase58() && (parsed.info.amount ?? parsed.info.tokenAmount?.amount) === net.toString();
  });
}
