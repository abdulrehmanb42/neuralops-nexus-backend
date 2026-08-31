"use client";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

// Route-level error boundary: a crash renders a recoverable page, never a
// white screen. `reset` re-renders the failed segment.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Wordmark className="text-[18px]" />
      <div>
        <h1 className="font-display text-[22px] font-extrabold">Something broke on our side</h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-ink2">
          The page hit an unexpected error. Your data is safe on your server — try again, and if it keeps
          happening, reload the app.
        </p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-ink2">ref: {error.digest}</p>}
      </div>
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    </div>
  );
}
