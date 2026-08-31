"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { NexusMark } from "@/components/brand/wordmark";
import { TopicView } from "@/components/chat/topic-view";
import { ChatListPanel } from "@/components/shell/chat-list-panel";
import { EmptyState } from "@/components/ui/surfaces";
import { useTopics } from "@/hooks/use-workspace";
import { useConnectionStore } from "@/stores/connection.store";
import { useSearchShortcut } from "@/lib/platform";
import { useSelection } from "@/stores/selection.store";
import { useUiStore } from "@/stores/ui.store";

// The whole workspace renders under /w — which pane shows is driven by the
// selection store, so no project/channel/chat id ever appears in the URL.
//
// Anatomy: the left tree is Projects → Channels only; the selected channel's
// CHATS live in a right-side panel (thread-panel style) next to the open chat.
// On phones the panel IS the content until a chat is opened.
export default function WorkspacePage() {
  const { sel, setTopic } = useSelection();
  const collapsed = useUiStore((u) => u.chatsPanelCollapsed);

  // Opening a CHANNEL auto-opens its first topic — armed only on channel
  // TRANSITIONS (adjust-during-render), so "back to topics" (which clears
  // the topic in place) isn't hijacked straight back into the topic.
  const { data: topics } = useTopics(sel?.pid, sel?.cid);
  const [armedFor, setArmedFor] = useState<string | null>(sel?.cid ?? null);
  const [prevCid, setPrevCid] = useState(sel?.cid);
  if (sel?.cid !== prevCid) {
    setPrevCid(sel?.cid);
    setArmedFor(sel?.cid ?? null);
  }
  useEffect(() => {
    if (!sel?.cid || sel.tid || armedFor !== sel.cid || !topics) return;
    const raf = requestAnimationFrame(() => {
      setArmedFor(null); // one shot — empty channels stay on the list
      if (topics.length > 0) setTopic(sel.pid, sel.cid, topics[0].id);
    });
    return () => cancelAnimationFrame(raf);
  }, [sel?.cid, sel?.tid, sel?.pid, armedFor, topics, setTopic]);

  if (!sel?.cid) return <Home />;
  // Collapse only applies while a topic is open — with none open, the panel
  // is the only way to pick one, so it always shows.
  const panelHidden = !!sel.tid && collapsed;
  return (
    <div className="flex min-h-0 flex-1">
      <div className={`min-w-0 flex-1 flex-col ${sel.tid ? "flex" : "hidden lg:flex"}`}>
        {sel.tid ? <TopicView key={sel.tid} pid={sel.pid} cid={sel.cid} tid={sel.tid} /> : <ChannelHome />}
      </div>
      {!panelHidden && (
        <div className={`min-h-0 flex-col border-line lg:w-72 lg:flex-none lg:border-l xl:w-80 ${sel.tid ? "hidden lg:flex" : "flex w-full"}`}>
          <ChatListPanel key={sel.cid} pid={sel.pid} cid={sel.cid} />
        </div>
      )}
    </div>
  );
}

function Home() {
  const companyName = useConnectionStore((s) => s.connection?.companyName);
  const shortcut = useSearchShortcut();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <NexusMark className="size-12 opacity-60" />
      <h1 className="font-display text-[20px] font-extrabold">{companyName ?? "Your workspace"}</h1>
      <p className="max-w-sm text-[14px] text-ink2">
        Pick a channel on the left — or press <kbd className="rounded border border-line bg-surface2 px-1.5 font-mono text-[12px]">{shortcut}</kbd> to jump anywhere.
      </p>
    </div>
  );
}

// Desktop-only (on phones the chat panel takes the whole width instead):
// the channel is open but no chat is — point at the panel.
function ChannelHome() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        icon={<MessageSquareText strokeWidth={1.8} />}
        title="Pick a topic"
        hint="This channel's topics are in the panel on the right — open one, or start a new one there."
      />
    </div>
  );
}
