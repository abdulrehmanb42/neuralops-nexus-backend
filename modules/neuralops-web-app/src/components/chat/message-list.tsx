"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/surfaces";
import type { TransitionItem, UiMessage } from "@/lib/realtime/message-store";
import { sortKey } from "@/lib/realtime/message-store";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { MessageItem, SystemSeparator } from "./message-item";

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

export function MessageList({ messages, transitions, loading, loadError, onRetry, onLoadOlder, jumpToId, onJumped, totalLoaded }: {
  messages: UiMessage[];
  transitions: TransitionItem[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onLoadOlder: () => Promise<number>;
  jumpToId?: string | null;
  onJumped?: () => void;
  totalLoaded?: number; // raw loaded count — pagination gate
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  // Follow the stream: stick to the bottom on new content unless scrolled up.
  const totalLength = messages.reduce((n, m) => n + m.content.length, 0) + messages.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [totalLength]);

  // Jump-to-message: center + flash. No cleanup-cancel (onJumped immediately
  // nulls the id, which would kill the removal timer) — and remove+reflow so
  // repeat jumps to the same message re-trigger the animation.
  useEffect(() => {
    if (!jumpToId) return;
    const target = scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(jumpToId)}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center" });
      target.classList.remove("nx-flash");
      void target.offsetWidth; // reflow restarts the animation
      target.classList.add("nx-flash");
      window.setTimeout(() => target.classList.remove("nx-flash"), 1_700);
    } else {
      // Never a silent no-op — the target lives outside the loaded window.
      toast.info("That message isn't loaded here — it may be in older history.");
    }
    onJumped?.();
  }, [jumpToId, onJumped]);

  // Flicker-free: fast loads show no skeleton at all; a skeleton that did
  // appear stays up long enough to read as intentional.
  if (loading || showSkeleton) {
    return showSkeleton ? (
      <div className="flex flex-1 flex-col gap-4 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3"><Skeleton className="size-8 rounded-full" /><div className="flex-1"><Skeleton className="mb-2 h-3.5 w-40" /><Skeleton className="h-4 w-3/4" /></div></div>
        ))}
      </div>
    ) : (
      <div className="flex-1" aria-hidden />
    );
  }
  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[14px] text-crit">{loadError}</p>
        <Button size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<MessagesSquare strokeWidth={1.8} />}
          title="No messages yet"
          hint="Say something below — or @mention a persona to bring the AI in."
        />
      </div>
    );
  }

  // Interleave transitions after their anchor position.
  const items: Array<{ key: string; node: React.ReactNode; sort: number }> = messages.map((m) => ({
    key: m.id,
    node: <MessageItem message={m} />,
    sort: sortKey(m),
  }));
  for (const t of transitions) {
    items.push({
      key: t.key,
      sort: t.afterSortKey,
      node: <SystemSeparator content={t.toPersona && t.transitionType !== "return_control" ? `${t.fromPersona ?? "A persona"} → @${t.toPersona} (${t.transitionType === "delegation" ? "delegating" : "handing off"})` : t.content} />,
    });
  }
  items.sort((a, b) => a.sort - b.sort);

  const withDividers: Array<{ key: string; node: React.ReactNode; divider?: string }> = [];
  {
    let lastDay: string | null = null;
    for (const item of items) {
      const msg = messages.find((m) => m.id === item.key);
      const label = msg ? dayLabel(msg.createdAt) : null;
      withDividers.push({ key: item.key, node: item.node, divider: label && label !== lastDay ? label : undefined });
      if (label) lastDay = label;
    }
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
      {!noMore && (totalLoaded ?? messages.length) >= 100 && (
        <div className="flex justify-center pb-2">
          <Button size="sm" variant="ghost" loading={loadingOlder} onClick={async () => {
            setLoadingOlder(true);
            const el = scrollRef.current;
            const prevHeight = el?.scrollHeight ?? 0;
            const prevTop = el?.scrollTop ?? 0;
            try {
              const got = await onLoadOlder();
              if (got === 0) setNoMore(true); // genuinely at the beginning
              // Keep the reader anchored: Safari has no native scroll
              // anchoring, so compensate for the prepended height ourselves.
              requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
              });
            } catch {
              toast.error("Couldn't load earlier messages — try again.");
            } finally {
              setLoadingOlder(false);
            }
          }}>
            Load earlier messages
          </Button>
        </div>
      )}
      {withDividers.map((item) => (
        <Fragment key={item.key}>
          {item.divider && <DayDivider label={item.divider} />}
          {item.node}
        </Fragment>
      ))}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 px-4" aria-label={label}>
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-[11px] font-semibold text-ink2">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
