/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMintPolling } from "@/lib/hooks/useMintPolling";

const verifyForwardedMintMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cctp/forwardedReceipt", () => ({ verifyForwardedMint: verifyForwardedMintMock }));

const updateTransactionMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const checkMintReadinessMock = vi.hoisted(() => vi.fn());
const checkSolanaMintStatusMock = vi.hoisted(() => vi.fn());
const fetchAttestationUniversalMock = vi.hoisted(() => vi.fn());
const requestReattestationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/store/transactionStore", () => ({
  useTransactionStore: () => ({
    updateTransaction: updateTransactionMock,
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/lib/simulation", () => ({
  checkMintReadiness: checkMintReadinessMock,
  checkSolanaMintStatus: checkSolanaMintStatusMock,
}));

vi.mock("@/lib/iris", () => ({
  fetchAttestationUniversal: fetchAttestationUniversalMock,
  requestReattestation: requestReattestationMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useMintPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T00:00:00.000Z"));

    updateTransactionMock.mockReset();
    toastMock.mockReset();
    checkMintReadinessMock.mockReset();
    checkSolanaMintStatusMock.mockReset();
    fetchAttestationUniversalMock.mockReset();
    requestReattestationMock.mockReset();

    checkMintReadinessMock.mockResolvedValue({
      success: false,
      canMint: false,
      alreadyMinted: false,
      attestationReady: false,
      error: "not ready",
    });

    checkSolanaMintStatusMock.mockResolvedValue({
      success: false,
      canMint: false,
      alreadyMinted: false,
      error: "not ready",
    });

    fetchAttestationUniversalMock.mockResolvedValue({
      status: "pending",
      nonce: "42",
    });

    requestReattestationMock.mockResolvedValue({
      success: true,
      nonce: "42",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exits awaiting state and exposes a timeout flag after 10 minutes", async () => {
    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"1".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 1,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: true,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"1".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      result.current.setMessageExpired("42");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requestReattestationMock).toHaveBeenCalledWith(1, "42");
    expect(result.current.isAwaitingReattestation).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000 + 15_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isAwaitingReattestation).toBe(false);
    expect(result.current.reattestTimedOut).toBe(true);
    expect(result.current.messageExpired).toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Re-attestation delayed",
      })
    );
  });

  it("does not auto-trigger re-attestation again after timing out", async () => {
    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"2".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 1,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: true,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"2".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      result.current.setMessageExpired("42");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requestReattestationMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000 + 15_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.reattestTimedOut).toBe(true);
    expect(requestReattestationMock).toHaveBeenCalledTimes(1);
  });

  it("does not accept stale complete attestation payloads after re-attestation", async () => {
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete",
      nonce: "42",
      message: "0x1234",
      attestation: "0xabcd",
      expirationBlock: "123",
    });
    checkMintReadinessMock.mockResolvedValue({
      success: false,
      canMint: false,
      alreadyMinted: false,
      attestationReady: true,
      messageExpired: true,
      error: "Message expired",
      nonce: "42",
    });

    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"5".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 8453,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: true,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"5".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      result.current.setMessageExpired("42");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requestReattestationMock).toHaveBeenCalledWith(1, "42");
    expect(fetchAttestationUniversalMock).toHaveBeenCalledWith(
      1,
      `0x${"5".repeat(64)}`,
      { forceRefresh: true }
    );
    expect(checkMintReadinessMock).toHaveBeenCalledWith(
      1,
      8453,
      `0x${"5".repeat(64)}`,
      false
    );
    expect(result.current.canMint).toBe(false);
    expect(result.current.attestationReady).toBe(false);
    expect(result.current.isAwaitingReattestation).toBe(true);
    expect(result.current.expirationBlock).toBe("123");
    expect(result.current.error).toContain("expired");
  });

  it("accepts re-attested payloads with expirationBlock 0 without extra readiness checks", async () => {
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete",
      nonce: "42",
      message: "0x1234",
      attestation: "0xabcd",
      expirationBlock: "0",
    });

    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"6".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 8453,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: true,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"6".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      result.current.setMessageExpired("42");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(checkMintReadinessMock).not.toHaveBeenCalled();
    expect(result.current.canMint).toBe(true);
    expect(result.current.attestationReady).toBe(true);
    expect(result.current.messageExpired).toBe(false);
    expect(result.current.expirationBlock).toBe("0");
  });

  it("accepts re-attested expiring payloads when destination readiness can mint", async () => {
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete",
      nonce: "42",
      message: "0x1234",
      attestation: "0xabcd",
      expirationBlock: "999999",
    });
    checkMintReadinessMock.mockResolvedValue({
      success: true,
      canMint: true,
      alreadyMinted: false,
      attestationReady: true,
      messageExpired: false,
      nonce: "42",
    });

    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"7".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 8453,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: true,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"7".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      result.current.setMessageExpired("42");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(checkMintReadinessMock).toHaveBeenCalledWith(
      1,
      8453,
      `0x${"7".repeat(64)}`,
      false
    );
    expect(result.current.canMint).toBe(true);
    expect(result.current.attestationReady).toBe(true);
    expect(result.current.messageExpired).toBe(false);
    expect(result.current.expirationBlock).toBe("999999");
  });

  it("does not overlap slow Solana attestation fetches and resumes after settlement", async () => {
    const pending = deferred<{ status: string; nonce: string }>();
    fetchAttestationUniversalMock.mockReturnValueOnce(pending.promise);

    const { unmount } = renderHook(() => useMintPolling({
      burnTxHash: `0x${"9".repeat(64)}`,
      sourceChainId: 1,
      destinationChainId: "Solana",
      burnCompletedAt: new Date(),
      startedAt: new Date(),
      isSuccess: false,
      hasBurnCompleted: true,
      hasFetchAttestation: false,
      displaySteps: [{ name: "Burn", state: "success" }],
      onStepsUpdate: vi.fn(),
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(1);
    expect(checkSolanaMintStatusMock).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ status: "pending", nonce: "42" });
      await pending.promise;
    });
    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("keeps the Solana attestation check in flight until destination readiness settles", async () => {
    const pending = deferred<{ canMint: boolean; alreadyMinted: boolean; error: string }>();
    fetchAttestationUniversalMock.mockResolvedValueOnce({
      status: "complete", nonce: "42", message: "0x1234", attestation: "0xabcd",
    });
    checkSolanaMintStatusMock.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useMintPolling({
      burnTxHash: `0x${"a".repeat(64)}`,
      sourceChainId: 1,
      destinationChainId: "Solana",
      burnCompletedAt: new Date(),
      startedAt: new Date(),
      isSuccess: false,
      hasBurnCompleted: true,
      hasFetchAttestation: false,
      displaySteps: [{ name: "Burn", state: "success" }],
      onStepsUpdate: vi.fn(),
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(1);
    expect(checkSolanaMintStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ canMint: false, alreadyMinted: false, error: "not ready" });
      await pending.promise;
    });

    expect(result.current.attestationReady).toBe(false);
    expect(result.current.error).toBe("not ready");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(2);
    expect(checkSolanaMintStatusMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("ignores a cleaned-up Solana attestation fetch and resumes for the new transaction", async () => {
    const oldHash = `0x${"b".repeat(64)}`;
    const newHash = `0x${"c".repeat(64)}`;
    const onStepsUpdate = vi.fn();
    const staleAttestation = {
      status: "complete",
      nonce: "42",
      message: "0x1234",
      attestation: "0xabcd",
      delayReason: "insufficient_fee",
    };
    const pending = deferred<typeof staleAttestation>();
    fetchAttestationUniversalMock.mockReturnValueOnce(pending.promise).mockResolvedValue({
      ...staleAttestation, nonce: "43", delayReason: undefined,
    });
    checkSolanaMintStatusMock.mockResolvedValue({ canMint: true, alreadyMinted: false });

    const { result, rerender, unmount } = renderHook(({ burnTxHash }) => useMintPolling({
      burnTxHash,
      sourceChainId: 1,
      destinationChainId: "Solana",
      burnCompletedAt: new Date(),
      startedAt: new Date(),
      isSuccess: false,
      hasBurnCompleted: true,
      hasFetchAttestation: false,
      displaySteps: [
        { name: "Burn", state: "success", txHash: burnTxHash },
        { name: "Fetch Attestation", state: "pending" },
      ],
      onStepsUpdate,
    }), { initialProps: { burnTxHash: oldHash } });

    rerender({ burnTxHash: newHash });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(staleAttestation);
      await pending.promise;
    });

    expect(checkSolanaMintStatusMock).not.toHaveBeenCalled();
    expect(updateTransactionMock).not.toHaveBeenCalled();
    expect(onStepsUpdate).not.toHaveBeenCalled();
    expect(result.current.attestationReady).toBe(false);
    expect(result.current.delayReason).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(2);
    expect(fetchAttestationUniversalMock).toHaveBeenLastCalledWith(1, newHash);
    expect(result.current.canMint).toBe(true);
    expect(updateTransactionMock).toHaveBeenCalledTimes(1);
    expect(updateTransactionMock).toHaveBeenCalledWith(newHash, expect.objectContaining({ nonce: "43" }));
    unmount();
  });

  it("ignores destination readiness results after the Solana attestation effect is cleaned up", async () => {
    const pending = deferred<{ canMint: boolean; alreadyMinted: boolean }>();
    const onStepsUpdate = vi.fn();
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete", nonce: "42", message: "0x1234", attestation: "0xabcd",
    });
    checkSolanaMintStatusMock.mockReturnValueOnce(pending.promise);

    const { result, rerender, unmount } = renderHook(({ isSuccess }) => useMintPolling({
      burnTxHash: `0x${"d".repeat(64)}`,
      sourceChainId: 1,
      destinationChainId: "Solana",
      burnCompletedAt: new Date(),
      startedAt: new Date(),
      isSuccess,
      hasBurnCompleted: true,
      hasFetchAttestation: false,
      displaySteps: [{ name: "Burn", state: "success" }],
      onStepsUpdate,
    }), { initialProps: { isSuccess: false } });

    await act(async () => {
      await Promise.resolve();
    });
    expect(checkSolanaMintStatusMock).toHaveBeenCalledTimes(1);

    rerender({ isSuccess: true });
    await act(async () => {
      pending.resolve({ canMint: true, alreadyMinted: false });
      await pending.promise;
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(updateTransactionMock).not.toHaveBeenCalled();
    expect(onStepsUpdate).not.toHaveBeenCalled();
    expect(result.current.attestationReady).toBe(false);
    expect(result.current.canMint).toBe(false);
    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("continues polling an old Solana transfer until its attestation becomes ready", async () => {
    const hash = `0x${"8".repeat(64)}`;
    const onStepsUpdate = vi.fn();
    checkSolanaMintStatusMock.mockResolvedValue({ canMint: true, alreadyMinted: false });
    const { result, unmount } = renderHook(() => useMintPolling({
      burnTxHash: hash,
      sourceChainId: 1,
      destinationChainId: "Solana",
      burnCompletedAt: new Date("2026-02-20T00:00:00.000Z"),
      startedAt: new Date("2026-02-20T00:00:00.000Z"),
      isSuccess: false,
      hasBurnCompleted: true,
      hasFetchAttestation: false,
      displaySteps: [
        { name: "Burn", state: "success", txHash: hash },
        { name: "Fetch Attestation", state: "pending" },
        { name: "Mint", state: "pending" },
      ],
      onStepsUpdate,
    }));
    await act(async () => { await Promise.resolve(); });
    expect(fetchAttestationUniversalMock).toHaveBeenCalledWith(1, hash);
    expect(result.current.attestationReady).toBe(false);
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete", nonce: "42", message: "0x1234", attestation: "0xabcd",
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.attestationReady).toBe(true);
    expect(onStepsUpdate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: "Fetch Attestation", state: "success" }),
    ]));
    const calls = fetchAttestationUniversalMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchAttestationUniversalMock).toHaveBeenCalledTimes(calls);
    unmount();
  });

  it("does not mark attestation ready when Iris returns complete without payload", async () => {
    fetchAttestationUniversalMock.mockResolvedValue({
      status: "complete",
      nonce: "55",
    });

    const { result } = renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"3".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: "Solana",
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: false,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"3".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.attestationReady).toBe(false);
    expect(result.current.error).toContain("incomplete");
  });

  it("applies transfer-type downgrade once per delay reason", async () => {
    checkMintReadinessMock.mockResolvedValue({
      success: false,
      canMint: false,
      alreadyMinted: false,
      attestationReady: false,
      delayReason: "insufficient_fee",
      error: "pending",
    });

    renderHook(() =>
      useMintPolling({
        burnTxHash: `0x${"4".repeat(64)}`,
        sourceChainId: 1,
        destinationChainId: 8453,
        burnCompletedAt: new Date("2026-02-21T00:00:00.000Z"),
        startedAt: new Date("2026-02-21T00:00:00.000Z"),
        isSuccess: false,
        hasBurnCompleted: true,
        hasFetchAttestation: false,
        displaySteps: [
          { name: "Burn", state: "success", txHash: `0x${"4".repeat(64)}` },
          { name: "Fetch Attestation", state: "pending" },
          { name: "Mint", state: "pending" },
        ],
        onStepsUpdate: vi.fn(),
      })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const downgradeCalls = updateTransactionMock.mock.calls.filter(
      ([, updates]) => updates?.transferType === "standard"
    );
    expect(downgradeCalls).toHaveLength(1);
  });
  it("keeps automatic claim polling after attestation and requires a verified destination receipt", async () => {
    verifyForwardedMintMock.mockResolvedValue(false);
    const hash = `0x${"a".repeat(64)}`;
    fetchAttestationUniversalMock.mockResolvedValue({ status: "complete", nonce: "42", message: "0x1234", forwardTxHash: hash });
    const onStepsUpdate = vi.fn();
    renderHook(() => useMintPolling({ automaticClaim: true, recipientAddress: "0x1111111111111111111111111111111111111111", burnTxHash: `0x${"b".repeat(64)}`, sourceChainId: 1, destinationChainId: 5042, burnCompletedAt: new Date(), startedAt: new Date(), isSuccess: false, hasBurnCompleted: true, hasFetchAttestation: true, displaySteps: [{ name: "Burn", state: "success" }, { name: "Mint", state: "pending" }], onStepsUpdate }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(checkMintReadinessMock).not.toHaveBeenCalled();
    expect(verifyForwardedMintMock).toHaveBeenCalled();
    expect(updateTransactionMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "claimed" }));
    verifyForwardedMintMock.mockResolvedValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(updateTransactionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "claimed", claimHash: hash }));
    expect(onStepsUpdate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "Mint", state: "success", txHash: hash })]));
  });

});
