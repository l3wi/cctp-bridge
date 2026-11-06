/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BridgeComparison } from "@/components/bridge-card/BridgeComparison";
const labels = { feeLabel: "0.060000 USDC", receiveLabel: "999.940000 USDC", confirmationLabel: "1 Block", speedLabel: "~20 seconds" };
describe("automatic claim form control", () => {
  it("keeps Standard fees visible and lets the user opt out", () => {
    const change = vi.fn();
    render(<BridgeComparison fastTransferSupported selectedSpeed="standard" onSpeedChange={vi.fn()} fastLabels={labels} standardLabels={labels} renderButton={() => <button>Bridge Standard</button>} automaticClaimSupported automaticClaim onAutomaticClaimChange={change} />);
    expect(screen.getByText("Total fees")).toBeTruthy();
    expect(screen.getByText("Bridge Standard")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Automatic claim" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(change).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Faster attestation with a small fee.")).toBeNull();
  });
});
