import { sql } from "drizzle-orm";
import { getDatabase } from "./client";
import { bridgeBurnSubmissions } from "./schema";
import type { ParsedBridgeBurnEventMetadata } from "@/lib/analytics/bridgeBurnEvent";

const USDC_SCALE = 1_000_000n;

export interface BridgeBurnCategoryStatistics {
  totalVolumeAtomic: number;
  fastVolumeAtomic: number;
  standardVolumeAtomic: number;
  totalFeesAtomic: number;
  fastFeesAtomic: number;
  supportFeesAtomic: number;
  totalBridges: number;
  fastBridges: number;
  standardBridges: number;
}

export interface BridgeBurnStatistics {
  evm: BridgeBurnCategoryStatistics;
  solana: BridgeBurnCategoryStatistics;
}

const createEmptyBridgeBurnCategoryStatistics = (): BridgeBurnCategoryStatistics => ({
  totalVolumeAtomic: 0,
  fastVolumeAtomic: 0,
  standardVolumeAtomic: 0,
  totalFeesAtomic: 0,
  fastFeesAtomic: 0,
  supportFeesAtomic: 0,
  totalBridges: 0,
  fastBridges: 0,
  standardBridges: 0,
});

const decimalUsdcToAtomic = (value: string): bigint => {
  const [whole, fraction = ""] = value.split(".");
  const atomic = BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(6, "0"));
  if (atomic > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("USDC amount exceeds the database integer safety range");
  }
  return atomic;
};

export interface RecordBridgeBurnSubmissionInput {
  eventId: string;
  metadata: ParsedBridgeBurnEventMetadata;
  fromAddress: string;
  toAddress: string;
  appFeeBps?: number;
}

export const recordBridgeBurnSubmission = async ({
  eventId,
  metadata,
  fromAddress,
  toAddress,
  appFeeBps,
}: RecordBridgeBurnSubmissionInput): Promise<void> => {
  const separator = eventId.indexOf(":");
  if (separator <= 0 || separator === eventId.length - 1) {
    throw new Error("Invalid bridge burn event id");
  }

  const now = new Date();
  const db = getDatabase();

  await db
    .insert(bridgeBurnSubmissions)
    .values({
      id: eventId,
      burnHash: eventId.slice(separator + 1),
      sourceChainId: metadata.sourceChainId,
      targetChainId: metadata.targetChainId,
      fromAddress,
      toAddress,
      transferType: metadata.speed === "f" ? "fast" : "standard",
      amountAtomic: Number(decimalUsdcToAtomic(metadata.amount)),
      appFeeAtomic: Number(decimalUsdcToAtomic(metadata.appFastFee)),
      appFeeBps: appFeeBps ?? null,
      circleFeeAtomic: Number(decimalUsdcToAtomic(metadata.circleFastFee)),
      submittedAt: now,
      recordedAt: now,
    })
    .onConflictDoNothing({ target: bridgeBurnSubmissions.id });
};

export const getBridgeBurnSummary = async () => {
  const db = getDatabase();

  return db
    .select({
      transferType: bridgeBurnSubmissions.transferType,
      eventCount: sql<number>`count(*)`,
      amountAtomic: sql<number>`coalesce(sum(${bridgeBurnSubmissions.amountAtomic}), 0)`,
      appFeeAtomic: sql<number>`coalesce(sum(${bridgeBurnSubmissions.appFeeAtomic}), 0)`,
      circleFeeAtomic: sql<number>`coalesce(sum(${bridgeBurnSubmissions.circleFeeAtomic}), 0)`,
    })
    .from(bridgeBurnSubmissions)
    .groupBy(bridgeBurnSubmissions.transferType);
};

export const getBridgeBurnStatistics = async ({
  since,
}: {
  since: Date;
}): Promise<BridgeBurnStatistics> => {
  const db = getDatabase();
  const rows = await db
    .select({
      sourceChainId: bridgeBurnSubmissions.sourceChainId,
      transferType: bridgeBurnSubmissions.transferType,
      eventCount: sql<number>`count(*)`,
      volumeAtomic: sql<number>`coalesce(sum(${bridgeBurnSubmissions.amountAtomic}), 0)`,
      feesAtomic: sql<number>`coalesce(sum(${bridgeBurnSubmissions.appFeeAtomic}), 0)`,
    })
    .from(bridgeBurnSubmissions)
    .where(sql`${bridgeBurnSubmissions.submittedAt} >= ${since}`)
    .groupBy(bridgeBurnSubmissions.sourceChainId, bridgeBurnSubmissions.transferType);

  const statistics = {
    evm: createEmptyBridgeBurnCategoryStatistics(),
    solana: createEmptyBridgeBurnCategoryStatistics(),
  } satisfies BridgeBurnStatistics;

  for (const row of rows) {
    const category = row.sourceChainId.startsWith("Solana")
      ? statistics.solana
      : statistics.evm;
    const eventCount = Number(row.eventCount);
    const volumeAtomic = Number(row.volumeAtomic);
    const feesAtomic = Number(row.feesAtomic);

    category.totalBridges += eventCount;
    category.totalVolumeAtomic += volumeAtomic;
    category.totalFeesAtomic += feesAtomic;

    if (row.transferType === "fast") {
      category.fastBridges += eventCount;
      category.fastVolumeAtomic += volumeAtomic;
      category.fastFeesAtomic += feesAtomic;
    } else {
      category.standardBridges += eventCount;
      category.standardVolumeAtomic += volumeAtomic;
      category.supportFeesAtomic += feesAtomic;
    }
  }

  return statistics;
};
