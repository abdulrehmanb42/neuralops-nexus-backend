import { Plus, Hash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopics, useMarkTopicRead, useCreateTopic } from "@/hooks/useWorkspace";
import { useUIStore } from "@/store/ui.store";
import { useProjects } from "@/hooks/useWorkspace";

export function TopicList({ projectId, channelId }: { projectId: string; channelId: string }) {
  const { data: topics, isLoading } = useTopics(projectId, channelId);
  const { data: projects } = useProjects();
  const activeTopicId = useUIStore((s) => s.activeTopicId);
  const setActiveTopicId = useUIStore((s) => s.setActiveTopicId);
  const { mutate: markRead } = useMarkTopicRead(projectId, channelId);

  const project = projects?.find((p) => p.id === projectId);
  const channel = project?.channels.find((c) => c.id === channelId);

  const createTopic = useCreateTopic(projectId, channelId, (topic) => {
    setActiveTopicId(topic.id);
  });

  function handleTopicClick(topicId: string) {
    setActiveTopicId(topicId);
    markRead(topicId);
  }

  function handleNewTopic() {
    const n = (topics?.length ?? 0) + 1;
    createTopic.mutate({ title: `chat#${n}` });
  }

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-3">
        <Hash className="h-4 w-4 text-foreground-muted" />
        <span className="truncate text-sm font-semibold text-foreground flex-1">
          {channel?.name ?? "channel"}
        </span>
        <button
          onClick={handleNewTopic}
          disabled={createTopic.isPending}
          title="New conversation"
          className="shrink-0 text-foreground-muted hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-7 w-2/3" />
          </div>
        )}
        {!isLoading && (!topics || topics.length === 0) && (
          <p className="px-2 py-3 text-xs text-foreground-muted">
            Click <strong>+</strong> to start a new conversation.
          </p>
        )}
        {!isLoading &&
          topics?.map((t) => {
            const active = t.id === activeTopicId;
            const unread = !active && t.has_unread;
            return (
              <button
                key={t.id}
                onClick={() => handleTopicClick(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : unread
                      ? "text-foreground font-semibold hover:bg-sidebar-accent"
                      : "text-foreground-muted hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                    unread ? "bg-primary" : "bg-transparent"
                  }`}
                />
                <span className="truncate">{t.title}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
