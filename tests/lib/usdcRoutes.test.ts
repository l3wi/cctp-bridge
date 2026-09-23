import { describe, expect, it } from "vitest";
import { getAllSupportedChains } from "@/lib/metadata";
import { getUsdcChains, getUsdcRoute, getUsdcRoutes } from "@/lib/usdcRoutes";

describe("public USDC routes", () => {
  it("covers supported mainnet pairs without duplicate or same-chain URLs", () => {
    const chains = getUsdcChains();
    const supported = getAllSupportedChains("mainnet").filter((chain) => chain.cctp?.contracts?.v2 && chain.usdcAddress);
    expect(chains).toHaveLength(supported.length);
    const routes = getUsdcRoutes();
    expect(routes).toHaveLength(chains.length * (chains.length - 1));
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
    expect(routes.every((route) => route.source.chainId !== route.destination.chainId)).toBe(true);
  });

  it("rejects unknown, testnet, noncanonical and same-network routes", () => {
    for (const source of ["unknown", "solana-devnet", "Solana", "base"]) {
      expect(getUsdcRoute(source, "base")).toBeUndefined();
    }
  });

  it("uses the source network for confirmations and destination for gas and recipient", () => {
    const forward = getUsdcRoute("solana", "base")!;
    const reverse = getUsdcRoute("base", "solana")!;
    expect(getUsdcRoute("unichain", "base")?.source.gasSymbol).toBe("ETH");
    expect(forward.source.chainId).toBe("Solana");
    expect(forward.destination.chainId).toBe(8453);
    expect(forward.faqs[1].answer).toContain("32 source confirmations");
    expect(reverse.faqs[1].answer).toContain("65 source confirmations");
    expect(forward.faqs[3].answer).toContain("ETH there for destination gas");
    expect(reverse.faqs[3].answer).toContain("SOL there for destination gas");
    expect(forward.faqs[6].answer).toContain("signature");
    expect(reverse.faqs[6].answer).toContain("hash");
    expect(forward.faqs[0].answer).toContain("not guaranteed end-to-end delivery");
  });
});
