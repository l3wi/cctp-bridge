import Table from "cli-table3";
import type {
  BridgeBurnCategoryStatistics,
  BridgeBurnStatistics,
} from "@/lib/db/bridgeBurnSubmissions";

export const BRIDGE_STATISTICS_DAY_OPTIONS = [7, 30, 90, 120] as const;
export type BridgeStatisticsDays = (typeof BRIDGE_STATISTICS_DAY_OPTIONS)[number];

const USDC_SCALE = 1_000_000n;
const VOLUME_COMPACT_THRESHOLD_ATOMIC = 5_000_000_000n;
const FEE_COMPACT_THRESHOLD_ATOMIC = 1_000_000_000n;

export const parseBridgeStatisticsDays = (
  args: readonly string[]
): BridgeStatisticsDays => {
  if (args.length !== 2 || args[0] !== "--days") {
    throw new Error("Usage: bun run db:bridge-report -- --days 7|30|90|120");
  }

  const days = Number(args[1]);
  if (
    !Number.isInteger(days) ||
    !BRIDGE_STATISTICS_DAY_OPTIONS.includes(days as BridgeStatisticsDays)
  ) {
    throw new Error("--days must be one of: 7, 30, 90, 120");
  }

  return days as BridgeStatisticsDays;
};

export const formatAtomicUsdc = (value: number): string => {
  const atomic = BigInt(value);
  const whole = atomic / USDC_SCALE;
  const fraction = (atomic % USDC_SCALE).toString().padStart(6, "0");
  const groupedWhole = whole.toLocaleString("en-US");
  return `${groupedWhole}.${fraction}`;
};

const formatCompactAtomicUsdc = (
  value: number,
  compactThresholdAtomic: bigint
): string => {
  const atomic = BigInt(value);
  if (atomic <= compactThresholdAtomic) {
    return formatAtomicUsdc(value);
  }

  const usdc = Number(atomic) / Number(USDC_SCALE);
  const units = [
    { divisor: 1_000_000_000, suffix: "b" },
    { divisor: 1_000_000, suffix: "m" },
    { divisor: 1_000, suffix: "k" },
  ] as const;
  const unit = units.find(({ divisor }) => usdc >= divisor) ?? units.at(-1)!;

  return `${(usdc / unit.divisor).toFixed(2)}${unit.suffix}`;
};

const formatCount = (value: number): string => value.toLocaleString("en-US");

const formatAmount = (value: number): string =>
  `${formatCompactAtomicUsdc(value, VOLUME_COMPACT_THRESHOLD_ATOMIC)} USDC`;

const formatFeeAmount = (value: number): string =>
  `${formatCompactAtomicUsdc(value, FEE_COMPACT_THRESHOLD_ATOMIC)} USDC`;

const renderTable = (rows: string[][]): string => {
  const table = new Table({
    head: ["Chain", "Speed", "Amount", "Fees", "Txs"],
    colAligns: ["left", "left", "right", "right", "right"],
    style: { head: [], border: [] },
  });

  table.push(...rows);
  return table.toString();
};

const categoryRows = (
  label: string,
  statistics: BridgeBurnCategoryStatistics
): string[][] => [
  [label, "", formatAmount(statistics.totalVolumeAtomic), formatFeeAmount(statistics.totalFeesAtomic), formatCount(statistics.totalBridges)],
  ["", "Fast", formatAmount(statistics.fastVolumeAtomic), formatFeeAmount(statistics.fastFeesAtomic), formatCount(statistics.fastBridges)],
  ["", "Standard", formatAmount(statistics.standardVolumeAtomic), formatFeeAmount(statistics.supportFeesAtomic), formatCount(statistics.standardBridges)],
];

export const renderBridgeStatistics = ({
  days,
  statistics,
}: {
  days: BridgeStatisticsDays;
  statistics: BridgeBurnStatistics;
}): string =>
  [
    `Bridge statistics · last ${days} days`,
    "────────────────────────────────────────────────────────────────",
    renderTable([
      ...categoryRows("EVM", statistics.evm),
      ...categoryRows("Solana", statistics.solana),
      [
        "Total",
        "",
        formatAmount(statistics.evm.totalVolumeAtomic + statistics.solana.totalVolumeAtomic),
        formatFeeAmount(statistics.evm.totalFeesAtomic + statistics.solana.totalFeesAtomic),
        formatCount(statistics.evm.totalBridges + statistics.solana.totalBridges),
      ],
    ]),
  ].join("\n");
