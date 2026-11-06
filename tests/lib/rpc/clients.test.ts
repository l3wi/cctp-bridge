import { Connection, PublicKey } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { getSolanaConnectionOptions as SolanaConnectionOptionsFactory } from "@/lib/rpc/clients";

const getConfiguredSolanaRpcUrlsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rpc/config", () => ({
  getConfiguredSolanaRpcUrls: getConfiguredSolanaRpcUrlsMock,
}));

let getSolanaConnectionOptions: typeof SolanaConnectionOptionsFactory;

const urls = [
  "https://solana-rpc-1.example",
  "https://solana-rpc-2.example",
  "https://solana-rpc-3.example",
  "https://solana-rpc-4.example",
];

const balanceResponse = (init?: RequestInit) => Response.json({
  jsonrpc: "2.0",
  id: JSON.parse(String(init?.body)).id,
  result: { context: { slot: 1 }, value: 42 },
});

function readBalance() {
  const { endpoint, config } = getSolanaConnectionOptions("Solana");
  return new Connection(endpoint, config).getBalance(PublicKey.default);
}

describe("Solana RPC failover", () => {
  beforeEach(async () => {
    // Intentionally reload the module-owned scheduler: a static import leaks cooldowns between tests.
    vi.resetModules();
    vi.clearAllMocks();
    getConfiguredSolanaRpcUrlsMock.mockReturnValue(urls);
    ({ getSolanaConnectionOptions } = await import("@/lib/rpc/clients"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reaches the fourth provider after access, rate-limit, and server failures", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await readBalance()).toBe(42);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls);
  });

  it("recovers from browser network failures", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await readBalance()).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 408, 429, 500, 503])("falls back after HTTP %s", async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockResolvedValueOnce(new Response("unavailable", { status }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await readBalance()).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { code: 403, message: "Access forbidden" },
    { code: 429, message: "Quota exhausted" },
    { code: 503, message: "Service unavailable" },
    { code: -32005, message: "Node is behind" },
    { code: -32000, message: "Rate limit exceeded" },
    { code: -32000, message: "ACCESS FORBIDDEN" },
  ])("falls back after an HTTP 200 RPC failure: $message", async (error) => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockImplementationOnce(async (_input, init) => Response.json({
        jsonrpc: "2.0",
        id: JSON.parse(String(init?.body)).id,
        error,
      }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await readBalance()).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns non-retryable RPC errors without trying another provider", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => Response.json({
      jsonrpc: "2.0",
      id: JSON.parse(String(init?.body)).id,
      error: { code: -32602, message: "Invalid params" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readBalance()).rejects.toThrow("Invalid params");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a non-retryable HTTP failure", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readBalance()).rejects.toThrow("401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429])("tries each provider only once after HTTP %s exhaustion", async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("RPC access unavailable", { status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readBalance()).rejects.toThrow("RPC access unavailable");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls);
  });

  it("preserves the last network error when every provider fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readBalance()).rejects.toThrow("Network unavailable");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls);
  });

  it("moves past a stalled fetch instead of hanging the read", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockImplementationOnce((_input, init) => {
        const { promise, reject } = Promise.withResolvers<Response>();
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        return promise;
      });
    vi.stubGlobal("fetch", fetchMock);

    const balance = expect(readBalance()).resolves.toBe(42);
    await vi.runAllTimersAsync();

    await balance;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it.each([200, 503])("moves past an HTTP %s response whose body stalls", async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockImplementationOnce(async (_input, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
        },
      }), { status }));
    vi.stubGlobal("fetch", fetchMock);

    const balance = expect(readBalance()).resolves.toBe(42);
    await vi.runAllTimersAsync();

    await balance;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not try a provider when the caller has already cancelled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const reason = new DOMException("Cancelled by caller", "AbortError");
    controller.abort(reason);
    const { endpoint, config } = getSolanaConnectionOptions("Solana");

    await expect(config.fetch(endpoint, { signal: controller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors in-flight Request cancellation without failing over", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      return promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const reason = new DOMException("Cancelled by caller", "AbortError");
    const { endpoint, config } = getSolanaConnectionOptions("Solana");
    const request = new Request(endpoint, {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });
    const rejection = expect(config.fetch(request)).rejects.toBe(reason);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    controller.abort(reason);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("paces concurrent reads across separate connections without bursts", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => {
      starts.push(Date.now());
      return balanceResponse(init);
    }));

    const balances = Promise.all(Array.from({ length: 7 }, () => readBalance()));
    await vi.runAllTimersAsync();

    expect(await balances).toEqual(Array(7).fill(42));
    expect(starts.map((start) => start - starts[0])).toEqual([
      0, 334, 668, 1002, 1336, 1670, 2004,
    ]);
  });

  it("limits outstanding requests to two even when providers are slow", async () => {
    vi.useFakeTimers();
    const pending: Array<() => void> = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      pending.push(() => resolve(balanceResponse(init)));
      return promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const balances = Promise.all([readBalance(), readBalance(), readBalance()]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending[1]();
    pending[2]();

    expect(await balances).toEqual([42, 42, 42]);
  });

  it.each(["60", "http-date"])("skips a provider until its %s Retry-After expires", async (header) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const retryAfter = header === "http-date"
      ? new Date(Date.now() + 60_000).toUTCString()
      : header;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429, headers: { "Retry-After": retryAfter },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const first = readBalance();
    await vi.runAllTimersAsync();
    expect(await first).toBe(42);
    const second = readBalance();
    await vi.runAllTimersAsync();
    expect(await second).toBe(42);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([urls[0], urls[1], urls[1]]);

    await vi.advanceTimersByTimeAsync(60_000);
    const recovered = readBalance();
    await vi.runAllTimersAsync();
    expect(await recovered).toBe(42);
    expect(fetchMock.mock.lastCall?.[0]).toBe(urls[0]);
  });

  it("cools JSON-RPC rate limits even without a Retry-After header", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init))
      .mockImplementationOnce(async (_input, init) => Response.json({
        jsonrpc: "2.0", id: JSON.parse(String(init?.body)).id,
        error: { code: -32000, message: "Rate limit exceeded" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const first = readBalance();
    await vi.runAllTimersAsync();
    expect(await first).toBe(42);
    const second = readBalance();
    await vi.runAllTimersAsync();
    expect(await second).toBe(42);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([urls[0], urls[1], urls[1]]);
  });

  it("cancels a queued read without dispatching it or blocking later requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => balanceResponse(init));
    vi.stubGlobal("fetch", fetchMock);
    const first = readBalance();
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toBe(42);
    const controller = new AbortController();
    const { endpoint, config } = getSolanaConnectionOptions("Solana");
    const cancelled = expect(config.fetch(endpoint, { signal: controller.signal })).rejects.toThrow("cancelled");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled"));
    await cancelled;
    const next = readBalance();
    await vi.runAllTimersAsync();

    expect(await next).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds waiting when every provider is cooling down instead of hammering them", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("rate limited", {
      status: 429, headers: { "Retry-After": "60" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const exhausted = expect(readBalance()).rejects.toThrow("rate limited");
    await vi.runAllTimersAsync();
    await exhausted;
    const queued = expect(readBalance()).rejects.toThrow("providers are busy");
    await vi.advanceTimersByTimeAsync(15_000);
    await queued;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
