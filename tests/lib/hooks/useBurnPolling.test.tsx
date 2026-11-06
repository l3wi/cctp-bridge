/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBurnPolling } from "@/lib/hooks/useBurnPolling";

const getTransactionReceiptMock = vi.hoisted(() => vi.fn());
const createEvmPublicClientMock = vi.hoisted(() => vi.fn());
const getSignatureStatusesMock = vi.hoisted(() => vi.fn());
const createSolanaConnectionMock = vi.hoisted(() => vi.fn());
const notifyFeeReceiptMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cctp/standardFeeClient", () => ({ notifyStandardFeeReceipt: notifyFeeReceiptMock }));

vi.mock("wagmi", () => ({
  useWalletClient: () => ({
    data: undefined,
  }),
}));

vi.mock("@/lib/rpc/clients", () => ({
  createEvmPublicClient: createEvmPublicClientMock,
  createSolanaConnection: createSolanaConnectionMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useBurnPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    notifyFeeReceiptMock.mockReset().mockResolvedValue(undefined);
    getTransactionReceiptMock.mockReset();
    createEvmPublicClientMock.mockReset();
    createEvmPublicClientMock.mockReturnValue({
      getTransactionReceipt: getTransactionReceiptMock,
    });
    getSignatureStatusesMock.mockReset();
    createSolanaConnectionMock.mockReset();
    createSolanaConnectionMock.mockReturnValue({
      getSignatureStatuses: getSignatureStatusesMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      name: "EVM",
      sourceChainId: 1 as const,
      checkStatus: getTransactionReceiptMock,
      pendingResult: null,
    },
    {
      name: "Solana",
      sourceChainId: "Solana" as const,
      checkStatus: getSignatureStatusesMock,
      pendingResult: { value: [null] },
    },
  ])("does not overlap slow $name burn checks and resumes after settlement", async ({
    sourceChainId,
    checkStatus,
    pendingResult,
  }) => {
    const pending = deferred<typeof pendingResult>();
    checkStatus.mockReturnValueOnce(pending.promise).mockResolvedValue(pendingResult);

    const { result, unmount } = renderHook(() =>
      useBurnPolling({
        burnTxHash: `0x${"4".repeat(64)}`,
        sourceChainId,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(result.current.checking).toBe(true);

    await act(async () => {
      pending.resolve(pendingResult);
      await pending.promise;
    });

    expect(result.current.checking).toBe(false);
    expect(checkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(checkStatus).toHaveBeenCalledTimes(2);
    expect(result.current.timedOut).toBe(false);
    unmount();
  });

  it("times out without marking the burn as failed", async () => {
    const onBurnFailed = vi.fn();
    getTransactionReceiptMock.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useBurnPolling({
        burnTxHash: `0x${"1".repeat(64)}`,
        sourceChainId: 1,
        onBurnFailed,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(61_000);
      await Promise.resolve();
    });

    expect(result.current.timedOut).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.error).toContain("taking longer than expected");
    expect(onBurnFailed).not.toHaveBeenCalled();
    expect(notifyFeeReceiptMock).not.toHaveBeenCalled();
  });

  it("marks burn as failed when chain reports a revert", async () => {
    const onBurnFailed = vi.fn();
    getTransactionReceiptMock.mockResolvedValue({ status: "reverted" });

    const { result } = renderHook(() =>
      useBurnPolling({
        burnTxHash: `0x${"2".repeat(64)}`,
        sourceChainId: 1,
        onBurnFailed,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.failed).toBe(true);
    expect(result.current.timedOut).toBe(false);
    expect(result.current.error).toContain("reverted");
    expect(onBurnFailed).toHaveBeenCalledTimes(1);
    expect(notifyFeeReceiptMock).toHaveBeenCalledWith(`0x${"2".repeat(64)}`);
  });

  it("marks burn as confirmed when chain reports success", async () => {
    // Ledger notification must not hold up bridge progress.
    notifyFeeReceiptMock.mockReturnValue(new Promise(() => {}));
    const onBurnConfirmed = vi.fn();
    getTransactionReceiptMock.mockResolvedValue({ status: "success" });

    const { result } = renderHook(() =>
      useBurnPolling({
        burnTxHash: `0x${"3".repeat(64)}`,
        sourceChainId: 1,
        onBurnConfirmed,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.confirmed).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(onBurnConfirmed).toHaveBeenCalledTimes(1);
    expect(notifyFeeReceiptMock).toHaveBeenCalledWith(`0x${"3".repeat(64)}`);
  });
});
