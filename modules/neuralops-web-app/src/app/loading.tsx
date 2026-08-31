import { NexusMark } from "@/components/brand/wordmark";

// Route-segment loader: shown while a page's chunk/data loads.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-3">
        <NexusMark className="size-10 animate-pulse" />
        <span className="text-[13px] text-ink2">Loading…</span>
      </div>
    </div>
  );
}
