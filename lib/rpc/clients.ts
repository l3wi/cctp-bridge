import { Connection } from "@solana/web3.js";
import { createPublicClient, fallback, http, type Chain, type EIP1193Provider } from "viem";
import type { WalletClient } from "viem";
import type { BridgeEnvironment, EvmChainMetadata } from "@/lib/metadata/types";
import { BRIDGEKIT_ENV, resolveBridgeChain } from "@/lib/metadata/index";
import { getWalletFirstEvmTransport } from "@/lib/rpc/router";
import type { SolanaChainId } from "@/lib/types";
import { getConfiguredSolanaRpcUrls } from "@/lib/rpc/config";
import { solanaRpcScheduler } from "@/lib/rpc/solanaScheduler";

const DEFAULT_ENV: BridgeEnvironment = BRIDGEKIT_ENV;
const solanaConnectionCache = new Map<string, Connection>();
const SOLANA_RPC_TIMEOUT_MS = 10_000;

const isReadableStreamBody = (value: unknown): value is ReadableStream =>
  typeof ReadableStream !== "undefined" && value instanceof ReadableStream;

const normalizeRetryBody = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<BodyInit | undefined> => {
  if (init?.body !== undefined) {
    if (init.body === null) {
      return undefined;
    }
    if (isReadableStreamBody(init.body)) {
      return new Response(init.body).text();
    }
    return init.body;
  }

  const request = input instanceof Request ? input : undefined;
  if (!request) return undefined;

  return request.clone().text();
};

const parseSolanaRpcError = (payload: string): { code?: number; message?: string } => {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const error = parsed.error as { code?: number; message?: string };
      return {
        code: typeof error?.code === "number" ? error.code : undefined,
        message: typeof error?.message === "string" ? error.message : undefined,
      };
    }
  } catch {
    // Ignore non-JSON responses
  }
  return {};
};

const shouldRetrySolanaRequest = (
  response: Response,
  bodyText: string | null
): boolean => {
  if (response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500) {
    return true;
  }

  if (!response.ok) {
    return false;
  }

  if (!bodyText) return false;

  const { code, message } = parseSolanaRpcError(bodyText);
  if (code === 403 || code === 408 || code === 429 || code === -32005 || (code !== undefined && code >= 500 && code < 600)) {
    return true;
  }

  return typeof message === "string"
    ? /forbidden|too many requests|rate.?limit|node is (?:unhealthy|behind)/i.test(message)
    : false;
};

const buildSolanaFetch = (urls: string[]) => async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  if (!urls.length) {
    return fetch(input, init);
  }

  const request = input instanceof Request ? input : undefined;
  const signal = init?.signal ?? request?.signal;
  signal?.throwIfAborted();
  const method = init?.method ?? request?.method ?? "POST";
  const headers = new Headers(init?.headers ?? request?.headers);
  const body = await normalizeRetryBody(input, init);
  const requestInit = { ...init, method, headers, body };
  let lastError: unknown = new Error(`Solana RPC request failed`);

  const remaining = [...urls];
  while (remaining.length) {
    // Choose at dispatch time: a concurrent request may have cooled a provider.
    const result = await solanaRpcScheduler.run(remaining, signal, async (endpoint) => {
      remaining.splice(remaining.indexOf(endpoint), 1);
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      // Queueing does not consume the provider's network/body deadline.
      const timeout = setTimeout(
        () => controller.abort(new DOMException("Solana RPC request timed out", "TimeoutError")),
        SOLANA_RPC_TIMEOUT_MS
      );

      try {
        const response = await fetch(endpoint, { ...requestInit, signal: controller.signal });
        const responseText = await response.text();
        const transient = shouldRetrySolanaRequest(response, responseText);
        if (transient) {
          const { code, message } = parseSolanaRpcError(responseText);
          const rateLimited = response.status === 429 || code === 429 ||
            /too many requests|rate.?limit/i.test(message ?? "");
          const forbidden = response.status === 403 || code === 403 ||
            /forbidden/i.test(message ?? "");
          solanaRpcScheduler.failed(
            endpoint,
            response.headers.get("retry-after"),
            forbidden ? 60_000 : rateLimited ? 5_000 : 1_000
          );
        } else if (response.ok) {
          solanaRpcScheduler.succeeded(endpoint);
        }
        return {
          response: new Response(responseText || null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
          transient,
        };
      } catch (error) {
        signal?.throwIfAborted();
        solanaRpcScheduler.failed(endpoint);
        return { error };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    });
    if (result.response) {
      if (!result.transient || !remaining.length) return result.response;
      lastError = new Error(`Solana RPC transient error: ${result.response.status}`);
    } else {
      lastError = result.error;
    }
  }

  throw lastError;
};

const formatExplorerBaseUrl = (url?: string) => {
  if (!url) return undefined;
  const [base] = url.split("/tx/");
  return base.replace("{hash}", "").replace(/\/$/, "");
};

const mapChainToViem = (
  chain: EvmChainMetadata,
  rpcUrl?: string
): Chain => {
  const explorerBase = formatExplorerBaseUrl(chain.explorerUrl);

  return {
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: rpcUrl ? [rpcUrl] : [] },
      public: { http: rpcUrl ? [rpcUrl] : [] },
    },
    blockExplorers: explorerBase
      ? {
          default: {
            name: `${chain.name} Explorer`,
            url: explorerBase,
          },
        }
      : undefined,
    testnet: chain.isTestnet,
  };
};

export const getProviderFromWalletClient = (
  walletClient?: WalletClient
): EIP1193Provider | undefined => {
  if (!walletClient) return undefined;

  const transportProvider = walletClient.transport as unknown as EIP1193Provider;
  if (transportProvider && typeof transportProvider.request === "function") {
    return transportProvider;
  }

  const maybeValue = (walletClient.transport as { value?: unknown })?.value;
  if (
    maybeValue &&
    typeof maybeValue === "object" &&
    "request" in maybeValue &&
    typeof (maybeValue as { request?: unknown }).request === "function"
  ) {
    return maybeValue as EIP1193Provider;
  }

  return undefined;
};

export const createEvmPublicClient = (
  chainId: number,
  opts?: {
    walletClient?: WalletClient;
    env?: BridgeEnvironment;
  }
) => {
  const env = opts?.env ?? DEFAULT_ENV;
  const chain = resolveBridgeChain(chainId, env);
  const walletProvider = getProviderFromWalletClient(opts?.walletClient);
  const walletChainId = opts?.walletClient?.chain?.id;
  const transport = getWalletFirstEvmTransport(
    chainId,
    walletProvider,
    walletChainId,
    env
  );
  // Server receipt checks do not need the browser CORS/latency filter, which can
  // leave only a quota-limited provider. Keep wallet/browser routing unchanged.
  const serverRpcUrls = typeof window === "undefined" && !walletProvider
    ? [...new Set(chain.rpcEndpoints ?? [])]
    : [];
  const publicTransport = serverRpcUrls.length
    ? fallback([
        ...serverRpcUrls.map(url => http(url, { retryCount: 0 })),
        transport,
      ], { retryCount: 0 })
    : transport;
  const viemChain = mapChainToViem(chain);

  return createPublicClient({
    chain: viemChain,
    transport: publicTransport,
  });
};

export const getSolanaConnectionOptions = (
  chainId: SolanaChainId,
  commitment: "processed" | "confirmed" | "finalized" = "confirmed"
) => {
  const urls = getConfiguredSolanaRpcUrls(chainId);
  if (!urls.length) {
    throw new Error(`No Solana RPC endpoint configured for ${chainId}`);
  }

  return {
    endpoint: urls[0],
    config: {
      commitment,
      // This fetch already handles rate limits across all providers.
      disableRetryOnRateLimit: true,
      fetch: buildSolanaFetch(urls),
    },
  };
};

export const createSolanaConnection = (
  chainId: SolanaChainId,
  commitment: "processed" | "confirmed" | "finalized" = "confirmed",
  env: BridgeEnvironment = DEFAULT_ENV
) => {
  const cacheKey = `solana:${env}:${chainId}:${commitment}`;
  const cached = solanaConnectionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { endpoint, config } = getSolanaConnectionOptions(chainId, commitment);
  const connection = new Connection(endpoint, config);
  solanaConnectionCache.set(cacheKey, connection);
  return connection;
};
