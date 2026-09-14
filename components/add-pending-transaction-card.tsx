"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { BridgeResult } from "@circle-fin/bridge-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChainIcon } from "@/components/chain-icon";
import {
  BRIDGEKIT_ENV,
  getAllSupportedChains,
  getBridgeChainByIdUniversal,
  type UniversalChainDefinition,
} from "@/lib/bridgeConfig";
import { toChainDefinition } from "@/lib/chainDefinition";
import {
  getCctpDomainIdUniversal,
  getChainIdFromDomainUniversal,
  getChainInfoFromDomainAllChains,
  isNonceUsed,
} from "@/lib/contracts";
import {
  fetchAttestationByNonceUniversal,
  fetchAttestationUniversal,
  type AttestationData,
} from "@/lib/iris";
import { verifyRecoveredSolanaRecipient } from "@/lib/cctp/solana/recipient";
import { useTransactionStore } from "@/lib/store/transactionStore";
import {
  type ChainId,
  type LocalTransaction,
  type UniversalTxHash,
  isSolanaChain,
  isValidTxHash,
} from "@/lib/types";
import type { SolanaChainId } from "@/lib/cctp/types";

interface AddPendingTransactionCardProps {
  initialSourceChainId?: ChainId | null;
  initialTxHash?: string;
  initialError?: string | null;
  onBack?: () => void;
  headerAction?: ReactNode;
  onTransactionAdded?: (payload: {
    sourceChainId: ChainId;
    routeId: string;
    hash: UniversalTxHash;
  }) => void;
}

const getChainSelectId = (chain: UniversalChainDefinition): string => {
  if (chain.type === "evm") {
    return String((chain as { chainId: number }).chainId);
  }

  if (chain.type === "solana") {
    return (chain as { chain: string }).chain;
  }

  return "";
};

const parseChainSelectId = (value: string): ChainId => {
  if (value.startsWith("Solana")) {
    return value as ChainId;
  }

  return Number(value);
};

const getExistingHashKey = (transaction: LocalTransaction): string => {
  if (isSolanaChain(transaction.originChain)) {
    return transaction.hash;
  }

  return transaction.hash.toLowerCase();
};

const getChainDisplayName = (
  chainId: ChainId,
  supportedChains: UniversalChainDefinition[]
): string => {
  const chain = supportedChains.find((candidate) => {
    if (candidate.type === "evm") {
      return (candidate as { chainId: number }).chainId === chainId;
    }

    if (candidate.type === "solana") {
      return (candidate as { chain: string }).chain === chainId;
    }

    return false;
  });

  return chain?.name || String(chainId);
};

const getAttestationNotFoundMessage = (
  sourceChainId: ChainId,
  supportedChains: UniversalChainDefinition[]
): string => {
  const chainName = getChainDisplayName(sourceChainId, supportedChains);
  const sourceDomain = getCctpDomainIdUniversal(sourceChainId, BRIDGEKIT_ENV);
  const networkName = BRIDGEKIT_ENV === "mainnet" ? "mainnet" : "testnet";
  const domainLabel = sourceDomain === null ? "" : `, CCTP domain ${sourceDomain}`;

  return (
    `No Circle CCTP v2 message was found for ${chainName} ${networkName}${domainLabel}. ` +
    "Choose the source chain where the burn happened and paste the source burn transaction hash, not the destination wallet or claim transaction."
  );
};

const getNonceSubmittedAsHashMessage = (
  sourceChainId: ChainId,
  supportedChains: UniversalChainDefinition[]
): string => {
  const chainName = getChainDisplayName(sourceChainId, supportedChains);

  return (
    `Circle found this value as a CCTP nonce, not as a ${chainName} source burn transaction hash. ` +
    "Paste the source burn transaction hash from the source-chain explorer."
  );
};

export function AddPendingTransactionCard({
  initialSourceChainId = null,
  initialTxHash = "",
  initialError = null,
  onBack,
  headerAction,
  onTransactionAdded,
}: AddPendingTransactionCardProps) {
  const [selectedChainId, setSelectedChainId] = useState<ChainId | null>(
    initialSourceChainId
  );
  const [txHash, setTxHash] = useState(initialTxHash);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [walletMismatchWarning, setWalletMismatchWarning] = useState<string | null>(
    null
  );
  const [showSolanaRecipientInput, setShowSolanaRecipientInput] = useState(false);
  const [solanaRecipientAddress, setSolanaRecipientAddress] = useState("");
  const [cachedAttestation, setCachedAttestation] = useState<{
    sourceChainId: ChainId;
    burnTxHash: string;
    attestation: AttestationData;
  } | null>(null);

  const { transactions, addTransaction } = useTransactionStore();
  const { publicKey: solanaPublicKey } = useWallet();

  useEffect(() => {
    setSelectedChainId(initialSourceChainId);
    setCachedAttestation(null);
    setWalletMismatchWarning(null);
    setShowSolanaRecipientInput(false);
    setSolanaRecipientAddress("");
  }, [initialSourceChainId]);

  useEffect(() => {
    setTxHash(initialTxHash);
    setCachedAttestation(null);
    setWalletMismatchWarning(null);
    setShowSolanaRecipientInput(false);
    setSolanaRecipientAddress("");
  }, [initialTxHash]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const existingHashes = useMemo(
    () => new Set(transactions.map(getExistingHashKey)),
    [transactions]
  );

  const supportedChains = useMemo(() => getAllSupportedChains(BRIDGEKIT_ENV), []);
  const isSolanaSelected =
    selectedChainId !== null && isSolanaChain(selectedChainId);

  const handleSubmit = async () => {
    if (isLoading) {
      return;
    }

    if (!selectedChainId || !txHash) {
      setError("Please select a chain and enter a transaction hash");
      return;
    }

    const trimmedHash = txHash.trim();
    const isSolana = isSolanaChain(selectedChainId);

    const normalizedHash = isSolana ? trimmedHash : trimmedHash.toLowerCase();

    if (!isValidTxHash(normalizedHash)) {
      if (isSolana) {
        setError(
          "Invalid Solana transaction signature. Expected Base58 format (80-90 characters)."
        );
      } else {
        setError(
          "Invalid transaction hash format. Expected 0x followed by 64 hex characters."
        );
      }
      return;
    }

    const hashToCheck = isSolana ? normalizedHash : normalizedHash.toLowerCase();
    if (existingHashes.has(hashToCheck)) {
      setError("This transaction has already been added");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cachedMatches =
        cachedAttestation?.sourceChainId === selectedChainId &&
        cachedAttestation?.burnTxHash === normalizedHash;

      const attestationData = cachedMatches && cachedAttestation
        ? cachedAttestation.attestation
        : await fetchAttestationUniversal(selectedChainId, normalizedHash);

      if (!attestationData) {
        const nonceLookup = isSolana
          ? null
          : await fetchAttestationByNonceUniversal(selectedChainId, normalizedHash);
        if (nonceLookup?.attestation) {
          setCachedAttestation(null);
          setError(getNonceSubmittedAsHashMessage(selectedChainId, supportedChains));
          setIsLoading(false);
          return;
        }

        setCachedAttestation(null);
        setError(getAttestationNotFoundMessage(selectedChainId, supportedChains));
        setIsLoading(false);
        return;
      }

      setCachedAttestation({
        sourceChainId: selectedChainId,
        burnTxHash: normalizedHash,
        attestation: attestationData,
      });

      if (attestationData.destinationDomain === undefined) {
        setError("Attestation is still pending. Please wait and try again.");
        setIsLoading(false);
        return;
      }

      if (attestationData.sourceDomain === undefined) {
        setError("Attestation payload is incomplete. Please try again shortly.");
        setIsLoading(false);
        return;
      }

      const targetChainId = getChainIdFromDomainUniversal(
        attestationData.destinationDomain,
        BRIDGEKIT_ENV
      );

      if (!targetChainId) {
        const chainInfo = getChainInfoFromDomainAllChains(
          attestationData.destinationDomain
        );
        if (chainInfo) {
          if (chainInfo.isTestnet !== (BRIDGEKIT_ENV === "testnet")) {
            const expected = BRIDGEKIT_ENV === "testnet" ? "testnet" : "mainnet";
            setError(
              `Destination is on ${chainInfo.isTestnet ? "testnet" : "mainnet"}, but app is in ${expected} mode`
            );
          } else {
            setError(`Destination chain ${chainInfo.name} is not supported`);
          }
        } else {
          setError(`Unknown destination domain (${attestationData.destinationDomain})`);
        }
        setIsLoading(false);
        return;
      }

      if (!attestationData.mintRecipient) {
        setError("Transaction data incomplete - recipient address not available");
        setIsLoading(false);
        return;
      }

      let formattedAmount: string | undefined;
      if (attestationData.amount) {
        try {
          const amountBigInt = BigInt(attestationData.amount);
          if (amountBigInt <= BigInt(0)) {
            setError("Invalid transaction amount");
            setIsLoading(false);
            return;
          }
          formattedAmount = (Number(amountBigInt) / 1_000_000).toFixed(2);
        } catch {
          setError("Invalid transaction amount format");
          setIsLoading(false);
          return;
        }
      }

      let isAlreadyClaimed = false;
      if (attestationData.status === "complete" && !isSolanaChain(targetChainId)) {
        const nonceUsed = await isNonceUsed(
          targetChainId as number,
          attestationData.sourceDomain,
          attestationData.nonce,
          BRIDGEKIT_ENV
        );
        if (nonceUsed === null) {
          console.warn("Could not verify claim status for nonce - assuming pending");
        }
        isAlreadyClaimed = nonceUsed === true;
      }

      const sourceChain = getBridgeChainByIdUniversal(selectedChainId, BRIDGEKIT_ENV);
      const destinationChain = getBridgeChainByIdUniversal(targetChainId, BRIDGEKIT_ENV);
      if (!sourceChain || !destinationChain) {
        setError("Unsupported source or destination chain.");
        setIsLoading(false);
        return;
      }

      const attestationReady = attestationData.status === "complete";
      const steps: BridgeResult["steps"] = [
        {
          name: "Burn",
          state: "success",
          txHash: normalizedHash as `0x${string}`,
        },
        {
          name: "Fetch Attestation",
          state: attestationReady ? "success" : "pending",
        },
        {
          name: "Mint",
          state: isAlreadyClaimed ? "success" : "pending",
        },
      ];

      const transactionStatus = isAlreadyClaimed ? "claimed" : "pending";
      const bridgeState = isAlreadyClaimed ? "success" : "pending";

      let resolvedTargetAddress: string | undefined;
      setWalletMismatchWarning(null);

      if (isSolanaChain(targetChainId)) {
        const mintRecipientAta = attestationData.mintRecipient;
        const candidateRecipientAddress =
          solanaRecipientAddress.trim() || solanaPublicKey?.toBase58() || "";
        const recipientVerification = verifyRecoveredSolanaRecipient({
          candidateRecipientAddress,
          mintRecipientAta,
          destinationChainId: targetChainId as SolanaChainId,
        });

        if (!recipientVerification.ok) {
          setShowSolanaRecipientInput(true);
          setWalletMismatchWarning(recipientVerification.warning);
          setIsLoading(false);
          return;
        }

        resolvedTargetAddress = recipientVerification.recipientAddress;
      } else {
        const rawRecipient = attestationData.mintRecipient;
        if (rawRecipient && rawRecipient.startsWith("0x")) {
          resolvedTargetAddress = `0x${rawRecipient.slice(-40)}`.toLowerCase();
        } else {
          resolvedTargetAddress = rawRecipient;
        }
      }

      const destinationAddress = resolvedTargetAddress || attestationData.mintRecipient || "";
      const bridgeResult: BridgeResult = {
        state: bridgeState,
        provider: "CCTPV2BridgingProvider",
        amount: formattedAmount || "0",
        token: "USDC",
        source: {
          // Iris payloads do not include the original sender wallet for recovered transfers.
          address: "",
          chain: toChainDefinition(sourceChain),
        },
        destination: {
          address: destinationAddress as `0x${string}`,
          chain: toChainDefinition(destinationChain),
        },
        steps,
      };

      const transaction: Omit<LocalTransaction, "date"> = {
        hash: normalizedHash as UniversalTxHash,
        originChain: selectedChainId,
        targetChain: targetChainId,
        targetAddress: resolvedTargetAddress,
        amount: formattedAmount,
        status: transactionStatus,
        version: "v3",
        transferType: "standard",
        steps,
        bridgeState,
        bridgeResult,
        nonce: attestationData.nonce,
      };

      addTransaction(transaction);
      setCachedAttestation(null);
      setWalletMismatchWarning(null);
      setShowSolanaRecipientInput(false);
      setSolanaRecipientAddress("");

      onTransactionAdded?.({
        sourceChainId: selectedChainId,
        routeId: normalizedHash,
        hash: transaction.hash,
      });
    } catch (fetchError) {
      console.error("Failed to fetch transaction:", fetchError);
      setError("Failed to fetch transaction details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-[580px] rounded-2xl border-border bg-card text-card-foreground shadow-xl shadow-background/20">
      <CardContent className="space-y-6 p-5 sm:p-6">
        {(onBack || headerAction) && (
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-accent"
                onClick={onBack}
                aria-label="Back to Bridge Form"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="ml-auto">{headerAction}</div>
          </div>
        )}

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setWalletMismatchWarning(null);
            void handleSubmit();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="pending-source-network" className="text-sm font-medium text-foreground">Source network</label>
            <Select
              value={
                selectedChainId !== null
                  ? typeof selectedChainId === "string"
                    ? selectedChainId
                    : String(selectedChainId)
                  : ""
              }
              onValueChange={(value) => {
                setSelectedChainId(parseChainSelectId(value));
                setWalletMismatchWarning(null);
                setShowSolanaRecipientInput(false);
                setSolanaRecipientAddress("");
                setCachedAttestation(null);
                setError(null);
              }}
            >
              <SelectTrigger id="pending-source-network" aria-describedby="pending-source-help" className="h-12 rounded-xl border-border bg-secondary text-foreground">
                <SelectValue placeholder="Select source network">
                  {selectedChainId !== null &&
                    (() => {
                      const selected = supportedChains.find((chain) => {
                        if (chain.type === "evm") {
                          return (
                            (chain as { chainId: number }).chainId === selectedChainId
                          );
                        }
                        if (chain.type === "solana") {
                          return (
                            (chain as { chain: ChainId }).chain === selectedChainId
                          );
                        }
                        return false;
                      });

                      if (!selected) {
                        return null;
                      }

                      const chainIdForIcon: ChainId =
                        selected.type === "evm"
                          ? (selected as { chainId: number }).chainId
                          : (selected as { chain: ChainId }).chain;

                      return (
                        <div className="flex items-center gap-2">
                          <ChainIcon chainId={chainIdForIcon} size={24} />
                          <span>{selected.name}</span>
                        </div>
                      );
                    })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="cctp-theme border-border bg-popover text-popover-foreground">
                {supportedChains.map((chain) => {
                  const chainSelectId = getChainSelectId(chain);
                  const chainIdForIcon: ChainId =
                    chain.type === "evm"
                      ? (chain as { chainId: number }).chainId
                      : (chain as { chain: ChainId }).chain;

                  return (
                    <SelectItem
                      key={chainSelectId}
                      value={chainSelectId}
                      className="text-foreground focus:bg-accent focus:text-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <ChainIcon chainId={chainIdForIcon} size={24} />
                        <span>{chain.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p id="pending-source-help" className="text-xs leading-relaxed text-muted-foreground">
              The network you sent USDC from.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="pending-source-transaction" className="text-sm font-medium text-foreground">
              {isSolanaSelected ? "Source transaction signature" : "Source transaction hash"}
            </label>
            <input
              id="pending-source-transaction"
              type="text"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="pending-transaction-help"
              placeholder={
                isSolanaSelected
                  ? "Enter Solana signature (e.g., 2bX4P87La...)"
                  : "0x..."
              }
              value={txHash}
              onChange={(event) => {
                setTxHash(event.target.value);
                setWalletMismatchWarning(null);
                setShowSolanaRecipientInput(false);
                setSolanaRecipientAddress("");
                setCachedAttestation(null);
                setError(null);
              }}
              className="min-h-12 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id="pending-transaction-help" className="text-xs leading-relaxed text-muted-foreground">
              {isSolanaSelected
                ? "Copy the source transaction signature from your wallet or Solana explorer."
                : "Copy the source transaction hash from your wallet or block explorer."}
            </p>
          </div>

          {showSolanaRecipientInput && (
            <div className="space-y-2">
              <label
                htmlFor="pending-solana-recipient"
                className="text-sm font-medium text-foreground"
              >
                Recipient Solana Wallet
              </label>
              <input
                id="pending-solana-recipient"
                type="text"
                placeholder="Recipient wallet owner, not USDC token account"
                value={solanaRecipientAddress}
                onChange={(event) => {
                  setSolanaRecipientAddress(event.target.value);
                  setError(null);
                }}
                className="min-h-12 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Helpers may pay Solana fees and ATA rent, but USDC is minted only to
                the recipient account encoded by Circle.
              </p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {walletMismatchWarning && (
            <div role="alert" className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-400">{walletMismatchWarning}</p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={!selectedChainId || !txHash || isLoading}
            className="h-12 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Finding transfer...
              </>
            ) : (
              "Find transfer"
            )}
          </Button>
        </form>


      </CardContent>
    </Card>
  );
}
