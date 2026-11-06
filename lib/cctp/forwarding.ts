import { PublicKey } from "@solana/web3.js";
import { getAllSupportedChains } from "@/lib/bridgeConfig";
import { getCctpDomain, IRIS_API_ENDPOINTS } from "./shared";
import type { ChainId } from "./types";

export const isArcChain = (id: ChainId | null | undefined): boolean =>
  id === 5042 || id === 5042002;

const chainKey = (chain: ReturnType<typeof getAllSupportedChains>[number]): ChainId | undefined =>
  chain.type === "evm" ? chain.chainId : chain.type === "solana" ? chain.chain as ChainId : undefined;

/** Route eligibility comes from CCTP v2 and destination delivery capabilities. */
export function supportsAutomaticClaim(source: ChainId, destination: ChainId, isTestnet: boolean): boolean {
  if (source === destination) return false;
  const chains = getAllSupportedChains(isTestnet ? "testnet" : "mainnet");
  const from = chains.find(c => chainKey(c) === source);
  const to = chains.find(c => chainKey(c) === destination);
  const executable = (c: typeof from) => c?.type === "evm" || c?.type === "solana";
  return Boolean(executable(from) && executable(to) && from?.cctp?.contracts?.v2 && to?.cctp?.contracts?.v2 && to.cctp.forwarderSupported?.destination);
}

export function getForwardingHookData(destinationChainId: ChainId, recipientAddress?: string): `0x${string}` {
  const header = "636374702d666f7277617264".padEnd(48, "0") + "00000000";
  if (typeof destinationChainId === "number") return `0x${header}00000000`;
  if (!recipientAddress) throw new Error("A Solana recipient is required for automatic claim");
  const owner = new PublicKey(recipientAddress).toBytes();
  const ownerHex = Array.from(owner, b => b.toString(16).padStart(2, "0")).join("");
  // Request ATA creation (33 bytes: flag + owner). The mint recipient is its USDC ATA.
  return `0x${header}0000002101${ownerHex}`;
}

export interface ForwardingQuote {
  maxFee: bigint;
  forwardFee: bigint;
  protocolFee: bigint;
  quotedAt: number;
  hookData: `0x${string}`;
}

export async function getForwardingQuote(params: {
  sourceChainId: ChainId;
  destinationChainId: ChainId;
  amount: bigint;
  speed: "fast" | "standard";
  isTestnet: boolean;
  recipientAddress?: string;
}): Promise<ForwardingQuote> {
  const { sourceChainId, destinationChainId, amount, speed, isTestnet } = params;
  if (!supportsAutomaticClaim(sourceChainId, destinationChainId, isTestnet)) {
    throw new Error("Automatic claim is not supported for this route");
  }
  if (amount <= 0n) throw new Error("Amount must be positive");
  const hookData = getForwardingHookData(destinationChainId, params.recipientAddress);
  const setupQuery = typeof destinationChainId === "string" ? "&includeRecipientSetup=true" : "";
  const env = isTestnet ? "testnet" : "mainnet";
  const base = IRIS_API_ENDPOINTS[env];
  const response = await fetch(`${base}/v2/burn/USDC/fees/${getCctpDomain(sourceChainId, env)}/${getCctpDomain(destinationChainId, env)}?forward=true${setupQuery}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Automatic claim fees are unavailable. Please retry.");
  const tiers: unknown = await response.json();
  if (!Array.isArray(tiers)) throw new Error("Invalid forwarding quote");
  const tier = tiers.find(t => t.finalityThreshold === (speed === "fast" ? 1000 : 2000));
  const rate = String(tier?.minimumFee ?? "");
  const forward = String(tier?.forwardFee?.med ?? "");
  if (!/^\d+(\.\d{1,4})?$/.test(rate) || !/^\d+$/.test(forward)) throw new Error("Invalid forwarding quote");
  const [whole, fraction = ""] = rate.split(".");
  const scaledBps = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  if (scaledBps > 100_000_000n) throw new Error("Invalid forwarding fee rate");
  const protocolFee = (amount * scaledBps + 99_999_999n) / 100_000_000n;
  const forwardFee = BigInt(forward);
  const maxFee = protocolFee + forwardFee;
  if (forwardFee <= 0n || maxFee >= amount) throw new Error("Amount is too small for automatic claim fees");
  return { maxFee, forwardFee, protocolFee, hookData, quotedAt: Date.now() };
}
