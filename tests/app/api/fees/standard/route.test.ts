// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/fees/standard/route";

const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/standardFees", () => ({ reserveStandardFee: reserve, previewStandardFee: vi.fn(), updateStandardFee: vi.fn(), reconcileStandardFee: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/metadata", () => ({ resolveBridgeChainUniversal: vi.fn() }));
const input = { action: "reserve", requestId: "11111111-1111-4111-8111-111111111111", address: "0x1111111111111111111111111111111111111111", sourceChainId: 1, amountAtomic: "1000000", issuedAt: Date.now() };

describe("unsigned Standard fee quotes", () => {
  beforeEach(() => reserve.mockReset().mockResolvedValue({ id: input.requestId, token: "token", feeAtomic: 0, recipient: input.address }));
  it("accepts a quote without a wallet signature", async () => {
    const response = await POST(new Request("http://localhost/api/fees/standard", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ chargeFee: false, feeAtomic: "0" });
    expect(reserve).toHaveBeenCalledOnce();
  });
  it("rejects invalid wallet addresses before recording a quote", async () => {
    const response = await POST(new Request("http://localhost/api/fees/standard", { method: "POST", body: JSON.stringify({ ...input, address: "invalid" }) }));
    expect(response.status).toBe(409);
    expect(reserve).not.toHaveBeenCalled();
  });
});
