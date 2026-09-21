/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyStandardFeeReceipt, saveStandardFee } from "@/lib/cctp/standardFeeClient";

describe("fee receipt notification", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
  it("requests independent server verification only for the saved hash", async () => {
    const reservation = { id: "id", token: "token", chargeFee: true, feeAtomic: "100000000", recipient: "recipient" };
    saveStandardFee("0xwallet", reservation, "0xburn");
    await notifyStandardFeeReceipt("0xother");
    expect(fetchMock).not.toHaveBeenCalled();
    await notifyStandardFeeReceipt("0xburn");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "submit", id: "id", token: "token", burnHash: "0xburn" });
    expect(localStorage.getItem("cctp-standard-fee:0xwallet")).not.toBeNull();
  });
  it("retains recovery data if the receipt notification fails", async () => {
    saveStandardFee("0xwallet", { id: "id", token: "token", chargeFee: false, feeAtomic: "0", recipient: "recipient" }, "0xburn");
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(notifyStandardFeeReceipt("0xburn")).rejects.toThrow("offline");
    expect(localStorage.getItem("cctp-standard-fee:0xwallet")).not.toBeNull();
  });
});
