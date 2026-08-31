"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { parseSessionState, sessionRemainingMs, type SessionState } from "@/lib/chat/session-state";
import type { UiMessage } from "@/lib/realtime/message-store";

// Session status derived from the server's system messages (no endpoint
// exposes it). Expiry is lazy and silent server-side, so past the deadline
// the copy degrades honestly instead of pretending certainty.
export function SessionBanner({ messages, onEnd, ending }: {
  messages: UiMessage[];
  onEnd?: () => void; // absent for roles without session.close (Viewer)
  ending: boolean;
}) {
  const state = parseSessionState(messages);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state) return;
    // Resync right at session start — `now` may be minutes stale (it was
    // initialized at mount), which would inflate the countdown until the
    // first 30s tick. Deferred per the no-setState-in-effect rule.
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [state?.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by session identity

  if (!state) return null;
  return <BannerBody state={state} now={now} onEnd={onEnd} ending={ending} />;
}

function BannerBody({ state, now, onEnd, ending }: { state: SessionState; now: number; onEnd?: () => void; ending: boolean }) {
  const remaining = sessionRemainingMs(state, now);
  const names = state.personas.map((p) => `@${p}`).join(", ");
  const mins = Math.max(0, Math.ceil(remaining / 60_000));

  return (
    <div className="flex flex-none items-center gap-2.5 border-t border-accent/25 bg-accent/[.07] px-4 py-2" role="status">
      <Radio size={14} strokeWidth={2} className="flex-none text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-[12.5px] text-ink2">
        <b className="font-semibold text-ink">Session with {names}</b>
        {" — plain messages route to them automatically. "}
        {remaining > 0 ? (
          <span className="whitespace-nowrap">Ends in ~{mins} min.</span>
        ) : (
          <span className="whitespace-nowrap">It may have expired by now.</span>
        )}
      </p>
      {onEnd && (
        <button
          onClick={onEnd}
          disabled={ending}
          className="flex-none rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink2 hover:border-accent hover:text-ink disabled:opacity-50"
        >
          {ending ? "Ending…" : "End session"}
        </button>
      )}
    </div>
  );
}
