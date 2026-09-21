/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StandardFeeConfirmationProvider, useStandardFeeConfirmation } from "@/components/bridge-card/StandardFeeConfirmation";

function Trigger({ proceed }: { proceed: () => void }) {
  const confirm = useStandardFeeConfirmation();
  return <button onClick={async () => {
    if (await confirm({ volumeAtomic: "2400000000000", amountAtomic: "500000000", feeAtomic: "100000000" })) proceed();
  }}>Bridge</button>;
}
describe("Standard fee confirmation", () => {
  it("shows exact fee and received amount and only proceeds after confirmation", async () => {
    const proceed = vi.fn();
    render(<StandardFeeConfirmationProvider><Trigger proceed={proceed} /></StandardFeeConfirmationProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Bridge"));
    expect(screen.getByRole("dialog", { name: "Wow, 2.4m bridged via cctp.io so far!" })).toBeTruthy();
    expect(screen.getByText("500 USDC")).toBeTruthy();
    expect(screen.getByText("400 USDC")).toBeTruthy();
    expect(screen.getByText("100 USDC")).toBeTruthy();
    expect(proceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm and bridge"));
    await waitFor(() => expect(proceed).toHaveBeenCalledOnce());
  });
  it("cancels without proceeding", async () => {
    const proceed = vi.fn();
    render(<StandardFeeConfirmationProvider><Trigger proceed={proceed} /></StandardFeeConfirmationProvider>);
    fireEvent.click(screen.getByText("Bridge"));
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(proceed).not.toHaveBeenCalled();
  });
});
