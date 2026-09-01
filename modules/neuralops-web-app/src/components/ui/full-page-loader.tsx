import { NexusMark } from "@/components/brand/wordmark";

// Full-screen loader for blank pages — a route/segment loading, or a page held
// behind hydration/auth. Shows the app mark so an empty page never just sits
// there as a bare box.
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-3">
        <NexusMark className="size-10 animate-pulse" />
        <span className="text-[13px] text-ink2">{label}</span>
      </div>
    </div>
  );
}
