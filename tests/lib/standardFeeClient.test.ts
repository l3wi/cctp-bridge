/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStandardFee, notifyStandardFeeReceipt, saveStandardFee, reserveStandardFeeClient, recoverStandardFee } from "@/lib/cctp/standardFeeClient";

describe("fee receipt notification", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
  it("reserves without signing and retains an unobserved burn for recovery", async () => {
    const request = { requestId: "request", address: "0xwallet", sourceChainId: 1, amountAtomic: "1000000", issuedAt: Date.now() };
    await reserveStandardFeeClient(request);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "reserve", ...request });
    saveStandardFee("0xwallet", { id: "id", token: "token", chargeFee: false, feeAtomic: "0", recipient: "recipient" }, "0xburn");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, pendingReceipt: true }) });
    await expect(recoverStandardFee("0xwallet")).resolves.toBeUndefined();
    expect(localStorage.getItem("cctp-standard-fee:0xwallet")).toContain("0xburn");
  });
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
  it("does not block a new reservation on a previous unknown broadcast or overwrite its recovery", async () => {
    const previous = { id: "previous", token: "old-token", chargeFee: false, feeAtomic: "0", recipient: "recipient" };
    // Existing browsers start with the old single-entry persistence format.
    localStorage.setItem("cctp-standard-fee:0xwallet", JSON.stringify({ reservation: previous }));
    fetchMock.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.action === "cancel") return { ok: false, json: async () => ({ error: "Broadcast status must be reconciled before retrying" }) };
      return { ok: true, json: async () => ({ id: body.requestId, token: "new-token", chargeFee: false, feeAtomic: "0", recipient: "recipient" }) };
    });
    await expect(recoverStandardFee("0xwallet")).resolves.toBeUndefined();
    const next = await reserveStandardFeeClient({ requestId: "next", address: "0xwallet", sourceChainId: 1, amountAtomic: "1000000", issuedAt: Date.now() });
    saveStandardFee("0xwallet", next, "0xnext");
    expect(JSON.parse(localStorage.getItem("cctp-standard-fee:0xwallet")!)).toEqual([
      { reservation: previous },
      expect.objectContaining({ reservation: next, burnHash: "0xnext" }),
    ]);
    clearStandardFee("0xwallet", next.id);
    expect(JSON.parse(localStorage.getItem("cctp-standard-fee:0xwallet")!)).toEqual([{ reservation: previous }]);
  });
  it("keeps unavailable receipts while settling other entries and appending a new attempt", async () => {
    const pending = { id: "pending", token: "pending-token", chargeFee: false, feeAtomic: "0", recipient: "recipient" };
    const settled = { ...pending, id: "settled" };
    saveStandardFee("0xwallet", pending, "0xpending");
    saveStandardFee("0xwallet", settled, "0xsettled");
    fetchMock.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true, pendingReceipt: body.burnHash === "0xpending" }) };
    });
    await recoverStandardFee("0xwallet");
    const request = { requestId: "next", address: "0xwallet", sourceChainId: 1, amountAtomic: "1000000", issuedAt: Date.now() };
    await reserveStandardFeeClient(request);
    expect(JSON.parse(localStorage.getItem("cctp-standard-fee:0xwallet")!)).toEqual([
      { reservation: pending, burnHash: "0xpending" },
      { request },
    ]);
    await notifyStandardFeeReceipt("0xpending");
    expect(JSON.parse(fetchMock.mock.lastCall![1].body)).toEqual({ action: "submit", id: pending.id, token: pending.token, burnHash: "0xpending" });
  });
  it("retains entries after a failed recovery API request and retries them later", async () => {
    const reservation = { id: "id", token: "token", chargeFee: false, feeAtomic: "0", recipient: "recipient" };
    saveStandardFee("0xwallet", reservation, "0xburn");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(recoverStandardFee("0xwallet")).resolves.toBeUndefined();
    expect(localStorage.getItem("cctp-standard-fee:0xwallet")).toContain("0xburn");
    await recoverStandardFee("0xwallet");
    expect(localStorage.getItem("cctp-standard-fee:0xwallet")).toBeNull();
  });
  it("does not remove a new attempt saved while an earlier receipt is being recovered", async () => {
    const previous = { id: "previous", token: "token", chargeFee: false, feeAtomic: "0", recipient: "recipient" };
    const next = { ...previous, id: "next" };
    saveStandardFee("0xwallet", previous, "0xprevious");
    const { promise, resolve: complete } = Promise.withResolvers<unknown>();
    fetchMock.mockReturnValueOnce(promise);
    const recovery = recoverStandardFee("0xwallet");
    saveStandardFee("0xwallet", next, "0xnext");
    complete({ ok: true, json: async () => ({ ok: true }) });
    await recovery;
    expect(JSON.parse(localStorage.getItem("cctp-standard-fee:0xwallet")!)).toEqual([{ reservation: next, burnHash: "0xnext" }]);
  });
});
