"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FeeDetails { volumeAtomic: string; amountAtomic: string; feeAtomic: string }
const ConfirmationContext = createContext<(details: FeeDetails) => Promise<boolean>>(async () => {
  throw new Error("Fee confirmation is unavailable");
});
export const useStandardFeeConfirmation = () => useContext(ConfirmationContext);

const usdc = (atomic: string) => (Number(atomic) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });

export function StandardFeeConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [details, setDetails] = useState<FeeDetails | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const settle = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setDetails(null);
    resolve?.(confirmed);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const confirm = useCallback((next: FeeDetails) => new Promise<boolean>(resolve => {
    pending.current?.(false);
    pending.current = resolve;
    setDetails(next);
  }), []);
  return <ConfirmationContext.Provider value={confirm}>
    {children}
    <Dialog open={details !== null} onOpenChange={open => { if (!open) settle(false); }}>
      {details && <DialogContent className="cctp-theme text-foreground">
        <DialogHeader>
          <DialogTitle>Wow, {(Number(details.volumeAtomic) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 2 })}m bridged via cctp.io so far!</DialogTitle>
          <DialogDescription>
            While we appreciate your patronage, it doesn&apos;t keep the lights on. So per 1,000,000 USDC cumulatively bridged, a 100 USDC fee will be applied. Thanks for supporting cctp.io!
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt>Amount</dt><dd className="text-right tabular-nums">{usdc(details.amountAtomic)} USDC</dd>
          <dt>Fee</dt><dd className="text-right tabular-nums">{usdc(details.feeAtomic)} USDC</dd>
          <dt>Amount received</dt><dd className="text-right tabular-nums">{usdc((BigInt(details.amountAtomic) - BigInt(details.feeAtomic)).toString())} USDC</dd>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>Cancel</Button>
          <Button onClick={() => settle(true)}>Confirm and bridge</Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  </ConfirmationContext.Provider>;
}
