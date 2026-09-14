import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function BridgeCardSkeleton() {
  return (
    <Card className="mx-auto w-full max-w-[580px] rounded-2xl border-slate-700 bg-slate-800 text-white shadow-xl shadow-slate-950/10">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full space-y-2 sm:flex-1">
            <Skeleton className="h-4 w-14 bg-slate-700/80" />
            <Skeleton className="h-10 w-full bg-slate-700/80" />
          </div>
          <div className="hidden h-8 w-8 shrink-0 rounded-full border border-slate-600 bg-slate-700/50 sm:block" />
          <div className="w-full space-y-2 sm:flex-1">
            <Skeleton className="h-4 w-10 bg-slate-700/80" />
            <Skeleton className="h-10 w-full bg-slate-700/80" />
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-16 bg-slate-700/80" />
            <Skeleton className="h-4 w-28 bg-slate-700/80" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-9 w-32 bg-slate-700/80" />
            <Skeleton className="h-6 w-14 bg-slate-700/80" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-24 bg-slate-700/80" />
          <Skeleton className="h-11 w-44 bg-slate-700/80" />
        </div>
        <Skeleton className="h-4 w-64 max-w-full bg-slate-700/80" />
        <div className="divide-y divide-slate-700">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex justify-between py-2.5">
              <Skeleton className="h-5 w-28 bg-slate-700/80" />
              <Skeleton className="h-5 w-16 bg-slate-700/80" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full bg-slate-700/80" />
      </CardContent>
    </Card>
  );
}
