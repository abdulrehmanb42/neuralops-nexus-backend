import { useEffect, useState } from "react";
import { Layers, Clock } from "lucide-react";
import { TopicList } from "./TopicList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { ContextPanel } from "./ContextPanel";
import { ListSchedulesDialog } from "./slash-commands/forms/ListCards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/store/ui.store";
import { useTopicMessages } from "@/hooks/useChat";
import { listSchedules, SCHEDULES_CHANGED_EVENT } from "@/services/schedules.service";

export function ChatArea() {
  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const activeTopicId = useUIStore((s) => s.activeTopicId);

  const { messages, loading, send, typingActors } = useTopicMessages(
    activeProjectId,
    activeChannelId,
    activeTopicId,
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [activeScheduleCount, setActiveScheduleCount] = useState(0);

  useEffect(() => {
    if (!activeProjectId || !activeChannelId || !activeTopicId) {
      setActiveScheduleCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      listSchedules(activeProjectId, activeChannelId, activeTopicId)
        .then((items) => {
          if (!cancelled) setActiveScheduleCount(items.filter((s) => !s.is_paused).length);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener(SCHEDULES_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, refresh);
    };
  }, [activeProjectId, activeChannelId, activeTopicId]);

  if (!activeProjectId || !activeChannelId) return null;

  return (
    <div className="flex h-full overflow-hidden">
      <TopicList projectId={activeProjectId} channelId={activeChannelId} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-1.5 border-b px-3 py-1.5">
          <Button
            variant={schedulesOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setSchedulesOpen(true)}
            disabled={!activeTopicId}
            title="Schedules in this topic"
          >
            <Clock className="h-3.5 w-3.5" />
            Schedules
            {activeScheduleCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {activeScheduleCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={panelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setPanelOpen((v) => !v)}
            disabled={!activeTopicId}
            title="Toggle context panel"
          >
            <Layers className="h-3.5 w-3.5" />
            Context
          </Button>
        </div>

        <ListSchedulesDialog
          open={schedulesOpen}
          onClose={() => setSchedulesOpen(false)}
          projectId={activeProjectId}
          channelId={activeChannelId}
          topicId={activeTopicId}
        />

        {/* Main area: messages + optional context panel */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">Loading messages…</p>
                </div>
              ) : (
                <MessageList messages={messages} />
              )}
            </div>

            <TypingIndicator actors={typingActors} />

            <MessageInput
              onSend={send}
              projectId={activeProjectId}
              channelId={activeChannelId}
              topicId={activeTopicId}
              disabled={!activeTopicId}
              placeholder={activeTopicId ? undefined : "Select a conversation to start messaging"}
            />
          </div>

          {/* Context panel sidebar */}
          <ContextPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            projectId={activeProjectId}
            topicId={activeTopicId}
          />
        </div>
      </div>
    </div>
  );
}
