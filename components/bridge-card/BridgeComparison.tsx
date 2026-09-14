import type { ReactNode } from "react";
import { Zap } from "lucide-react";
import { TransferSpeed, type TransferSpeedValue } from "@/lib/cctp/transferSpeed";
import type { EstimateLabels } from "./utils";

interface BridgeComparisonProps {
  fastTransferSupported: boolean;
  selectedSpeed: TransferSpeedValue;
  onSpeedChange: (speed: TransferSpeedValue) => void;
  disabled?: boolean;
  fastLabels: EstimateLabels;
  standardLabels: EstimateLabels;
  renderButton: (speed: TransferSpeedValue, isPrimary: boolean) => ReactNode;
}

export function BridgeComparison({
  fastTransferSupported,
  selectedSpeed,
  onSpeedChange,
  disabled,
  fastLabels,
  standardLabels,
  renderButton,
}: BridgeComparisonProps) {
  const speed = fastTransferSupported ? selectedSpeed : TransferSpeed.SLOW;
  const isFast = speed === TransferSpeed.FAST;
  const labels = isFast ? fastLabels : standardLabels;
  const rows = [
    ["Estimated time", labels.speedLabel],
    ["Confirmations", labels.confirmationLabel],
    [isFast ? "Fast transfer fee" : "Transfer fee", labels.feeLabel],
    ["You receive", labels.receiveLabel],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm leading-5 text-slate-300">Transfer type</span>
            <p className="text-xs leading-4 text-slate-400">
              {isFast ? "Faster attestation with a small fee." : "Slower transfer that waits for chain finality"}
            </p>
          </div>
          <div className="flex shrink-0 rounded-lg border border-slate-600 bg-slate-900/50 p-1" role="group" aria-label="Transfer type">
            {fastTransferSupported && (
              <button
                type="button"
                aria-pressed={isFast}
                disabled={disabled}
                onClick={() => onSpeedChange(TransferSpeed.FAST)}
                className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${isFast ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"}`}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Fast
              </button>
            )}
            <button
              type="button"
              aria-pressed={!isFast}
              disabled={disabled}
              onClick={() => onSpeedChange(TransferSpeed.SLOW)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50 ${!isFast ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"}`}
            >
              Standard
            </button>
          </div>

      </div>
      <dl className="divide-y divide-slate-700">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-right font-medium text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      {renderButton(speed, true)}
    </div>
  );
}
