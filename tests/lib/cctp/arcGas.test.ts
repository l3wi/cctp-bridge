import { describe, expect, it } from "vitest";
import { getArcMaxAmount } from "@/lib/cctp/arcGas";

describe("Arc Max gas reserve", () => {
  it("leaves native USDC for approval and burn using the shared balance", () => {
    expect(getArcMaxAmount(1_000_000n, 10n ** 18n, 20_000_000_000n)).toBe(960_000n);
  });
  it("increases the reserve with gas price and rounds down to six decimals", () => {
    expect(getArcMaxAmount(1_000_000n, 10n ** 18n, 50_000_000_001n)).toBe(899_999n);
  });
  it("returns zero rather than spending gas funds when the wallet is too small", () => {
    expect(getArcMaxAmount(10_000n, 10n ** 16n, 20_000_000_000n)).toBe(0n);
  });
  it("never exceeds the ERC20 balance view", () => {
    expect(getArcMaxAmount(500_000n, 10n ** 18n, 0n)).toBe(500_000n);
  });
});
