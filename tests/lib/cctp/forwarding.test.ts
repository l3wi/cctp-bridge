import { afterEach, describe, expect, it, vi } from "vitest";
import { getForwardingQuote, supportsAutomaticClaim, getForwardingHookData } from "@/lib/cctp/forwarding";
const params = { sourceChainId: 11155111, destinationChainId: 5042002, amount: 1_000_000n, speed: "standard" as const, isTestnet: true };
afterEach(() => vi.unstubAllGlobals());
function response(tiers: unknown) {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => tiers });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("forwarding quotes", () => {
  it("includes forwarding for Standard and queries the forwarding endpoint", async () => {
    const fetcher = response([{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 60000 } }]);
    expect(await getForwardingQuote(params)).toMatchObject({ maxFee: 60000n, forwardFee: 60000n, protocolFee: 0n });
    expect(fetcher.mock.calls[0][0]).toContain("/0/26?forward=true");
  });
  it("rounds fractional protocol fees up and includes them in the authorized maximum", async () => {
    response([{ finalityThreshold: 1000, minimumFee: "1.3", forwardFee: { med: 60000 } }]);
    expect(await getForwardingQuote({ ...params, speed: "fast", amount: 1_000_001n })).toMatchObject({ maxFee: 60131n, protocolFee: 131n });
  });
  it.each([{ tiers: [] }, { tiers: [{ finalityThreshold: 2000, minimumFee: -1, forwardFee: { med: 60000 } }] }, { tiers: [{ finalityThreshold: 2000, minimumFee: 0 }] }, { tiers: [{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 1_000_000 } }] }])("rejects unusable quotes", async ({ tiers }) => {
    response(tiers);
    await expect(getForwardingQuote(params)).rejects.toThrow();
  });
  it("quotes Solana account setup and binds the hook to its owner", async () => {
    const fetcher = response([{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { med: 60000 } }]);
    const quote = await getForwardingQuote({ ...params, destinationChainId: "Solana_Devnet", recipientAddress: "11111111111111111111111111111111" });
    expect(fetcher.mock.calls[0][0]).toContain("/0/5?forward=true&includeRecipientSetup=true");
    expect(quote.hookData).toBe(getForwardingHookData("Solana_Devnet", "11111111111111111111111111111111"));
    expect(quote.hookData.length).toBe(132);
    expect(quote.hookData.slice(50, 68)).toBe("000000000000002101");
  });
  it("requires a valid Solana recipient before quoting", async () => {
    const fetcher = response([]);
    await expect(getForwardingQuote({ ...params, destinationChainId: "Solana_Devnet" })).rejects.toThrow("recipient");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([42161, 5042, 43114, 8453, 81224, 3343, 1, 999, 57073, 59144, 143, 10, 98866, 137, 1329, 146, 130, 480, 50])("offers forwarding on supported EVM destination %s", destination => {
    const source = destination === 1 ? 8453 : 1;
    expect(supportsAutomaticClaim(source, destination, false)).toBe(true);
  });
  it("does not enable unsupported sources or mixed networks", () => {
    expect(supportsAutomaticClaim("Solana_Devnet", 5042002, true)).toBe(true);
    expect(supportsAutomaticClaim(11155111, "Solana_Devnet", true)).toBe(true);
    expect(supportsAutomaticClaim(11155111, 11155111, true)).toBe(false);
    expect(supportsAutomaticClaim(1, 1776, false)).toBe(false);
    expect(supportsAutomaticClaim(1, 5042002, true)).toBe(false);
    expect(supportsAutomaticClaim(11155111, 5042002, true)).toBe(true);
  });
});
