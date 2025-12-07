import { Skeleton } from "./ui/skeleton";

/**
 * Skeleton loading state for forensic cockpit interface
 * Shows placeholder for timeline, workspace, analysis dock, and inspector
 */
export function CockpitSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Global Timeline Skeleton */}
      <div className="h-24 border-b border-border p-4">
        <Skeleton className="h-full w-full rounded" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Workspace Skeleton */}
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>

        {/* Signal Inspector Sidebar Skeleton */}
        <div className="w-80 border-l border-border p-4 space-y-4">
          {/* Metadata section */}
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>

          {/* Measurements section */}
          <div className="space-y-2 pt-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Classification section */}
          <div className="space-y-2 pt-4">
            <Skeleton className="h-6 w-36" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-2 flex-1" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analysis Dock Skeleton */}
      <div className="h-64 border-t border-border">
        {/* Tabs */}
        <div className="flex gap-2 p-2 border-b border-border">
          {['Spectrum', 'Constellation', 'Cyclostationary', 'Hex View'].map((tab) => (
            <Skeleton key={tab} className="h-8 w-32" />
          ))}
        </div>
        {/* Tab content */}
        <div className="p-4 h-[calc(100%-3rem)]">
          <Skeleton className="h-full w-full rounded" />
        </div>
      </div>
    </div>
  );
}
