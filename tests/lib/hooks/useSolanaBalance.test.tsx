/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { TokenAccountNotFoundError } from "@solana/spl-token";
import type * as SplToken from "@solana/spl-token";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSolanaBalance } from "@/lib/hooks/useSolanaBalance";

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  getBalance: vi.fn(),
  environment: "testnet",
}));
const publicKey = new PublicKey("11111111111111111111111111111111");
const connection = { getBalance: mocks.getBalance };

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ publicKey, connected: true }),
  useConnection: () => ({ connection }),
}));
vi.mock("@solana/spl-token", async (importOriginal) => ({
  ...(await importOriginal<typeof SplToken>()),
  getAccount: mocks.getAccount,
  // PDA derivation is outside this hook's cache/error contract and crosses jsdom's crypto realm.
  getAssociatedTokenAddress: vi.fn(async () => publicKey),
}));
vi.mock("@/lib/bridgeConfig", () => ({
  get BRIDGEKIT_ENV() { return mocks.environment; },
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSolanaBalance", () => {
  beforeEach(() => {
    mocks.environment = "testnet";
    mocks.getAccount.mockReset().mockResolvedValue({ amount: 12_500_000n });
    mocks.getBalance.mockReset().mockResolvedValue(2_000_000_000);
    // Keep retries enabled globally: the hook itself must suppress amplification.
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 1 } },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.useRealTimers();
  });

  it.each(["USDC", "SOL"])("retains cached balances and exposes a failed %s refresh", async (asset) => {
    const { result } = renderHook(() => useSolanaBalance(), { wrapper });
    await waitFor(() => expect(result.current.solBalance).toBe(2_000_000_000n));
    await waitFor(() => expect(result.current.usdcBalance).toBe(12_500_000n));
    const error = new Error("RPC unavailable");
    (asset === "USDC" ? mocks.getAccount : mocks.getBalance).mockRejectedValue(error);

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.usdcBalance).toBe(12_500_000n);
    expect(result.current.usdcFormatted).toBe("12.500000");
    expect(result.current.solBalance).toBe(2_000_000_000n);
    expect(result.current.solFormatted).toBe("2.000000000");
  });

  it("returns a genuine zero USDC balance for a missing associated token account", async () => {
    mocks.getAccount.mockRejectedValue(new TokenAccountNotFoundError());
    const { result } = renderHook(() => useSolanaBalance(), { wrapper });

    await waitFor(() => expect(result.current.usdcBalance).toBe(0n));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.usdcFormatted).toBe("0.000000");
    expect(result.current.error).toBeNull();
  });

  it("exposes initial transport errors without inventing zero balances or retrying automatically", async () => {
    const error = new Error("Rate limited");
    mocks.getAccount.mockRejectedValue(error);
    mocks.getBalance.mockRejectedValue(error);
    const { result } = renderHook(() => useSolanaBalance(), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(error));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.usdcBalance).toBeUndefined();
    expect(result.current.usdcFormatted).toBeUndefined();
    expect(result.current.solBalance).toBeUndefined();
    expect(result.current.solFormatted).toBeUndefined();

    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.getAccount).toHaveBeenCalledTimes(1);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a cached SOL balance from a different cluster", async () => {
    queryClient.setQueryData(["solana-sol-balance", publicKey.toBase58(), "Solana"], {
      balance: 99n,
      formatted: "0.000000099",
    });
    mocks.getBalance.mockReturnValue(Promise.withResolvers<number>().promise);
    const { result } = renderHook(() => useSolanaBalance(), { wrapper });

    expect(result.current.solBalance).toBeUndefined();
    await waitFor(() => expect(mocks.getBalance).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryState([
      "solana-sol-balance", publicKey.toBase58(), "Solana_Devnet",
    ])?.fetchStatus).toBe("fetching");
  });
});
