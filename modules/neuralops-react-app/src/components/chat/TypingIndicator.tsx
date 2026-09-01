import type { TypingActor } from "./types";

/**
 * Dedicated status bar for "X is thinking/typing..." -- its own fixed-height
 * strip with a border + background, distinct from both the message list
 * above and the composer below (not just floating inline text). Always
 * renders the bar (even with zero actors) so nothing shifts layout as
 * actors come and go -- only its content fades in/out. See #141.
 */
export function TypingIndicator({ actors }: { actors: TypingActor[] }) {
  const hasActors = actors.length > 0;

  const names = actors.map((a) => a.name);
  const anyThinking = actors.some((a) => a.type === "persona" || a.type === "agent");
  const verb = anyThinking ? "thinking" : "typing";

  const label =
    names.length === 1
      ? `${names[0]} is ${verb}...`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are ${verb}...`;

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-4 py-1.5 text-xs text-foreground-muted">
      {hasActors && (
        <>
          <div className="flex shrink-0 -space-x-1">
            {actors.slice(0, 3).map((a) => (
              <div
                key={a.id}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-background bg-accent text-[10px] font-semibold text-accent-foreground"
              >
                {a.avatar ? (
                  <img
                    src={a.avatar}
                    alt={a.name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  a.name.slice(0, 1).toUpperCase()
                )}
              </div>
            ))}
          </div>
          <span className="min-w-0">{label}</span>
          <span className="flex shrink-0 gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.3s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-foreground-muted [animation-delay:-0.15s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-foreground-muted" />
          </span>
        </>
      )}
    </div>
  );
}
