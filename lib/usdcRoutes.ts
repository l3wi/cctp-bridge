import { unichain } from "viem/chains";
import { getAllSupportedChains } from "@/lib/metadata";
import { getFinalityEstimate } from "@/lib/cctpFinality";
import { TransferSpeed } from "@/lib/cctp/transferSpeed";
import type { ChainId } from "@/lib/types";

export interface UsdcChain {
  slug: string;
  name: string;
  chainId: ChainId;
  gasSymbol: string;
  type: "evm" | "solana";
  standardConfirmations?: number;
  fastConfirmations?: number;
  standardAttestation?: string;
  fastAttestation?: string;
}

export interface UsdcRoute {
  source: UsdcChain;
  destination: UsdcChain;
  path: string;
  title: string;
  description: string;
  faqs: { question: string; answer: string }[];
}

// Explicit identities keep public URLs stable when upstream display names change.
const SLUG_BY_CHAIN: Partial<Record<ChainId, string>> = {
  1: "ethereum", 10: "optimism", 25: "cronos", 50: "xdc",
  130: "unichain", 137: "polygon", 143: "monad", 146: "sonic",
  196: "x-layer", 480: "world-chain", 999: "hyperevm", 1329: "sei",
  1672: "pharos", 1776: "injective", 2818: "morph", 3343: "edge",
  8453: "base", 42161: "arbitrum", 43114: "avalanche", 57073: "ink",
  59144: "linea", 81224: "codex", 98866: "plume", Solana: "solana",
};

export function getUsdcChains(): UsdcChain[] {
  return getAllSupportedChains("mainnet").flatMap((chain) => {
    const chainId = chain.type === "evm" ? chain.chainId : chain.chain;
    const slug = SLUG_BY_CHAIN[chainId];
    const v2 = chain.cctp?.contracts?.v2;
    if (!slug || chain.isTestnet || !chain.usdcAddress || chain.cctp?.domain == null || !v2?.tokenMessenger || !v2.messageTransmitter) return [];
    return [{
      slug, name: chain.name, chainId, gasSymbol: chainId === unichain.id ? unichain.nativeCurrency.symbol : chain.nativeCurrency.symbol,
      type: chain.type, standardConfirmations: v2.confirmations,
      fastConfirmations: v2.fastConfirmations,
      standardAttestation: getFinalityEstimate(chain.name, TransferSpeed.SLOW)?.averageTime,
      fastAttestation: v2.fastConfirmations ? getFinalityEstimate(chain.name, TransferSpeed.FAST)?.averageTime : undefined,
    }];
  });
}

function makeRoute(source: UsdcChain, destination: UsdcChain): UsdcRoute {
  const standard = source.standardAttestation ? `The configured Standard attestation estimate is ${source.standardAttestation}.` : "There is no published timing estimate in the app for this source network.";
  const fast = source.fastAttestation ? ` The Fast estimate, when available, is ${source.fastAttestation}.` : "";
  const confirmations = source.standardConfirmations == null ? "Check the bridge quote for the current confirmation requirement." : `The app uses ${source.standardConfirmations} source confirmations for Standard${source.fastConfirmations == null ? "" : ` and ${source.fastConfirmations} for Fast`}.`;
  return {
    source, destination, path: `/usdc/${source.slug}/${destination.slug}`,
    title: `Bridge USDC from ${source.name} to ${destination.name}`,
    description: `Transfer native USDC from ${source.name} to ${destination.name} with Circle CCTP. Compare transfer speeds, fees and source confirmations before bridging.`,
    faqs: [
      { question: `How long does USDC take to bridge from ${source.name} to ${destination.name}?`, answer: `${standard}${fast} These describe source attestation, not guaranteed end-to-end delivery. The destination claim on ${destination.name}, network congestion and wallet approval add time.` },
      { question: `How many confirmations are needed on ${source.name}?`, answer: `${confirmations} These are source-network requirements for Circle's attestation; they are separate from the transaction that mints USDC on ${destination.name}.` },
      { question: `Can I use Fast for ${source.name} to ${destination.name}?`, answer: source.fastConfirmations ? `The app supports Fast transfers from ${source.name}. Live allowance, pricing and network conditions can affect availability; review the selector and quote before confirming.` : `The app currently offers Standard transfers from ${source.name}; a separate Fast option is not configured for this source network. Review the timing estimate above and the live quote.` },
      { question: `Which wallets and gas tokens do I need?`, answer: `Use a ${source.type === "solana" ? "Solana" : "compatible EVM"} wallet holding native USDC on ${source.name} and ${source.gasSymbol} for the source transaction. The recipient must be a ${destination.type === "solana" ? "Solana" : "compatible EVM"} address on ${destination.name}. To claim yourself, connect the destination wallet and keep ${destination.gasSymbol} there for destination gas.` },
      { question: `What fees apply to this route?`, answer: `Budget for source gas in ${source.gasSymbol} on ${source.name} and destination claim gas in ${destination.gasSymbol} on ${destination.name}. Fast can also include Circle's Fast fee and an application fee deducted from USDC. Review the live fee breakdown and received amount before approving; gas is separate.` },
      { question: `Will I receive native USDC on ${destination.name}?`, answer: `Yes. CCTP burns native USDC on ${source.name} and mints native USDC on ${destination.name}. It does not send a wrapped representation. Select native USDC on the source network rather than a bridged token with a similar name.` },
      { question: `What if my ${source.name} to ${destination.name} transfer is pending?`, answer: `Use Find transfer with ${source.name} as the source and your source transaction ${source.type === "solana" ? "signature" : "hash"}. A transfer may be waiting for source confirmations, Circle's attestation, or a claim on ${destination.name}. Once attestation is ready, connect the destination wallet to continue an outstanding claim.` },
    ],
  };
}

export function getUsdcRoute(sourceSlug: string, destinationSlug: string): UsdcRoute | undefined {
  if (sourceSlug === destinationSlug) return undefined;
  const chains = getUsdcChains();
  const source = chains.find((chain) => chain.slug === sourceSlug);
  const destination = chains.find((chain) => chain.slug === destinationSlug);
  return source && destination ? makeRoute(source, destination) : undefined;
}

export function getUsdcRoutes(): UsdcRoute[] {
  const chains = getUsdcChains();
  return chains.flatMap((source) => chains.filter((destination) => destination.chainId !== source.chainId).map((destination) => makeRoute(source, destination)));
}
