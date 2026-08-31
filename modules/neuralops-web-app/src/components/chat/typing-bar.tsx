"use client";

import { absolutizeMedia } from "@/lib/api/client";
import type { TypingActor } from "@/lib/realtime/message-store";

// Floating presence indicator: overlays the bottom of the message area
// (Slack-style) — nothing rendered, and no space reserved, when idle. Humans
// only: a streaming persona already shows its own bubble+cursor, so surfacing
// it here too just overlapped that bubble (see use-chat's reducer).
export function TypingBar({ actors }: { actors: TypingActor[] }) {
  const humans = actors.filter((a) => a.kind === "human");
  const names = humans.map((a) => a.name).filter(Boolean);
  const label =
    names.length === 0 ? null
    : names.length === 1 ? `${names[0]} is typing…`
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are typing…`;
  if (!label) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-end gap-2 bg-gradient-to-t from-bg via-bg/85 to-transparent px-4 pb-1.5" aria-live="polite">
      {label && (
        <>
          <span className="flex -space-x-1.5" aria-hidden>
            {humans.slice(0, 3).map((a) => {
              const src = absolutizeMedia(a.avatar);
              return src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.key} src={src} alt="" className="size-4.5 rounded-full border border-bg object-cover" />
              ) : (
                <span key={a.key} className="flex size-4.5 items-center justify-center rounded-full border border-bg bg-accent/30 text-[9px] font-bold">{a.name[0]}</span>
              );
            })}
          </span>
          <span className="text-[12px] text-ink2">{label}</span>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1 animate-bounce rounded-full bg-live" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
