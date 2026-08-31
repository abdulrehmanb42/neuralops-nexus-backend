"use client";

import { CalendarClock, Layers, MessageCircle } from "lucide-react";

export type ChatTab = "messages" | "context" | "schedules";

const ORDER: ChatTab[] = ["messages", "context", "schedules"];

// Slack-style tab strip under the chat header. role="tablist" promises
// arrow-key navigation — Left/Right move AND select (roving selection).
export function ChatTabs({ tab, onTab }: { tab: ChatTab; onTab: (t: ChatTab) => void }) {
  const move = (dir: 1 | -1) => {
    const idx = ORDER.indexOf(tab);
    onTab(ORDER[(idx + dir + ORDER.length) % ORDER.length]);
  };
  return (
    <div
      role="tablist"
      aria-label="Chat views"
      className="flex gap-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <TabButton icon={<MessageCircle size={14} strokeWidth={2} />} label="Messages" selected={tab === "messages"} onClick={() => onTab("messages")} />
      <TabButton icon={<Layers size={14} strokeWidth={2} />} label="Context" selected={tab === "context"} onClick={() => onTab("context")} />
      <TabButton icon={<CalendarClock size={14} strokeWidth={2} />} label="Schedules" selected={tab === "schedules"} onClick={() => onTab("schedules")} />
    </div>
  );
}

function TabButton({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1} // roving tabindex — one Tab stop for the strip
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1 text-[13px] transition-colors ${
        selected ? "border-accent font-semibold text-ink" : "border-transparent text-ink2 hover:text-ink"
      }`}
    >
      {icon} {label}
    </button>
  );
}
