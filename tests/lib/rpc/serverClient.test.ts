import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvmChainMetadata } from "@/lib/metadata/types";

const chain: EvmChainMetadata = vi.hoisted(() => ({
  type: "evm", chain: "Arbitrum", chainId: 42161, name: "Arbitrum", isTestnet: false,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcEndpoints: ["https://sdk-rpc.example"],
}));
vi.mock("@/lib/metadata/index", () => ({
  BRIDGEKIT_ENV: "mainnet",
  resolveBridgeChain: () => chain,
}));
vi.mock("@/lib/rpc/config", () => ({
  getConfiguredEvmRpcUrls: () => ["https://browser-rpc.example"],
  getConfiguredSolanaRpcUrls: () => [],
}));

import { createEvmPublicClient } from "@/lib/rpc/clients";

afterEach(() => { vi.unstubAllGlobals(); });

describe("server EVM reads", () => {
  it("reads the chain from SDK metadata when the browser-only provider is quota limited", async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      return new URL(input instanceof Request ? input.url : String(input)).hostname === "sdk-rpc.example"
        ? Response.json({ jsonrpc: "2.0", id: 1, result: "0x7b" })
        : Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "Provider usage limit reached" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await createEvmPublicClient(42161).getBlockNumber()).toBe(123n);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains generated RPC fallback when the SDK endpoint is unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => new URL(input instanceof Request ? input.url : String(input)).hostname === "sdk-rpc.example"
      ? Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "Resource unavailable" } })
      : Response.json({ jsonrpc: "2.0", id: 1, result: "0x7c" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await createEvmPublicClient(42161).getBlockNumber()).toBe(124n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
