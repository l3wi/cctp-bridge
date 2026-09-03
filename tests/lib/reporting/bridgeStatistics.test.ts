import { describe, expect, it } from "vitest";
import {
  formatAtomicUsdc,
  parseBridgeStatisticsDays,
  renderBridgeStatistics,
} from "@/lib/reporting/bridgeStatistics";

describe("bridge statistics reporting", () => {
  it("accepts only the supported reporting windows", () => {
    expect(parseBridgeStatisticsDays(["--days", "30"])).toBe(30);
    expect(() => parseBridgeStatisticsDays(["--days", "14"])).toThrow(
      "--days must be one of: 7, 30, 90, 120"
    );
    expect(() => parseBridgeStatisticsDays(["--days", "30", "extra"])).toThrow(
      "Usage:"
    );
  });

  it("formats atomic USDC without floating-point rounding", () => {
    expect(formatAtomicUsdc(1_234_567_890)).toBe("1,234.567890");
  });

  it("uses compact notation above 5,000 USDC in the report", () => {
    expect(
      renderBridgeStatistics({
        days: 7,
        statistics: {
          evm: {
            totalVolumeAtomic: 5_000_000_001,
            fastVolumeAtomic: 5_000_000_001,
            standardVolumeAtomic: 0,
            totalFeesAtomic: 1_200_000_000,
            fastFeesAtomic: 1_200_000_000,
            supportFeesAtomic: 0,
            totalBridges: 1,
            fastBridges: 1,
            standardBridges: 0,
          },
          solana: {
            totalVolumeAtomic: 2_340_000_000_000,
            fastVolumeAtomic: 0,
            standardVolumeAtomic: 2_340_000_000_000,
            totalFeesAtomic: 0,
            fastFeesAtomic: 0,
            supportFeesAtomic: 0,
            totalBridges: 1,
            fastBridges: 0,
            standardBridges: 1,
          },
        },
      })
    ).toContain("5.00k USDC");
    expect(
      renderBridgeStatistics({
        days: 7,
        statistics: {
          evm: {
            totalVolumeAtomic: 5_000_000_001,
            fastVolumeAtomic: 5_000_000_001,
            standardVolumeAtomic: 0,
            totalFeesAtomic: 1_200_000_000,
            fastFeesAtomic: 1_200_000_000,
            supportFeesAtomic: 0,
            totalBridges: 1,
            fastBridges: 1,
            standardBridges: 0,
          },
          solana: {
            totalVolumeAtomic: 0,
            fastVolumeAtomic: 0,
            standardVolumeAtomic: 0,
            totalFeesAtomic: 0,
            fastFeesAtomic: 0,
            supportFeesAtomic: 0,
            totalBridges: 0,
            fastBridges: 0,
            standardBridges: 0,
          },
        },
      })
    ).toContain("1.20k USDC");
    expect(
      renderBridgeStatistics({
        days: 7,
        statistics: {
          evm: {
            totalVolumeAtomic: 2_340_000_000_000,
            fastVolumeAtomic: 2_340_000_000_000,
            standardVolumeAtomic: 0,
            totalFeesAtomic: 0,
            fastFeesAtomic: 0,
            supportFeesAtomic: 0,
            totalBridges: 1,
            fastBridges: 1,
            standardBridges: 0,
          },
          solana: {
            totalVolumeAtomic: 0,
            fastVolumeAtomic: 0,
            standardVolumeAtomic: 0,
            totalFeesAtomic: 0,
            fastFeesAtomic: 0,
            supportFeesAtomic: 0,
            totalBridges: 0,
            fastBridges: 0,
            standardBridges: 0,
          },
        },
      })
    ).toContain("2.34m USDC");
  });

  it("renders the volume, fee, and bridge-count breakdown", () => {
    expect(
      renderBridgeStatistics({
        days: 7,
        statistics: {
          evm: {
            totalVolumeAtomic: 1_000_000_000,
            fastVolumeAtomic: 700_000_000,
            standardVolumeAtomic: 300_000_000,
            totalFeesAtomic: 500_000,
            fastFeesAtomic: 200_000,
            supportFeesAtomic: 300_000,
            totalBridges: 2,
            fastBridges: 1,
            standardBridges: 1,
          },
          solana: {
            totalVolumeAtomic: 500_000_000,
            fastVolumeAtomic: 300_000_000,
            standardVolumeAtomic: 200_000_000,
            totalFeesAtomic: 200_000,
            fastFeesAtomic: 0,
            supportFeesAtomic: 200_000,
            totalBridges: 1,
            fastBridges: 1,
            standardBridges: 0,
          },
        },
      })
    ).toContain("Chain  │ Speed    │            Amount │          Fees │ Txs");
    expect(
      renderBridgeStatistics({
        days: 7,
        statistics: {
          evm: {
            totalVolumeAtomic: 1_000_000_000,
            fastVolumeAtomic: 700_000_000,
            standardVolumeAtomic: 300_000_000,
            totalFeesAtomic: 500_000,
            fastFeesAtomic: 200_000,
            supportFeesAtomic: 300_000,
            totalBridges: 2,
            fastBridges: 1,
            standardBridges: 1,
          },
          solana: {
            totalVolumeAtomic: 500_000_000,
            fastVolumeAtomic: 300_000_000,
            standardVolumeAtomic: 200_000_000,
            totalFeesAtomic: 200_000,
            fastFeesAtomic: 0,
            supportFeesAtomic: 200_000,
            totalBridges: 1,
            fastBridges: 1,
            standardBridges: 0,
          },
        },
      })
    ).toContain("│        │ Standard │   200.000000 USDC │ 0.200000 USDC │   0 │");
  });
});
