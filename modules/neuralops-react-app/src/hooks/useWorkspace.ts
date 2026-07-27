import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getProjects,
  createProject,
  getTopics,
  createChannel,
  createTopic,
  renameTopic,
  markTopicRead,
  getTeam,
  addTeamMember,
  removeTeamMember,
  getAvailableUsers,
  getAvailablePersonas,
  type Topic,
} from "@/services/workspace.service";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: getProjects });
}

export function useCreateProject(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success("Project created");
      qc.invalidateQueries({ queryKey: ["projects"] });
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTopics(projectId: string, channelId: string) {
  return useQuery({
    queryKey: ["topics", projectId, channelId],
    queryFn: () => getTopics(projectId, channelId),
    enabled: !!projectId && !!channelId,
    refetchInterval: 10_000,   // refresh unread dots every 10 s
  });
}

export function useMarkTopicRead(
  projectId: string,
  channelId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => markTopicRead(projectId, channelId, topicId),
    onSuccess: () => {
      // Immediately clear the dot in the sidebar
      qc.invalidateQueries({ queryKey: ["topics", projectId, channelId] });
    },
  });
}

export function useCreateChannel(projectId: string, onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      createChannel(projectId, payload),
    onSuccess: () => {
      toast.success("Channel created");
      qc.invalidateQueries({ queryKey: ["projects"] });
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateTopic(
  projectId: string,
  channelId: string,
  onSuccess?: (topic: Topic) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string }) =>
      createTopic(projectId, channelId, payload),
    onSuccess: (topic) => {
      qc.invalidateQueries({ queryKey: ["topics", projectId, channelId] });
      onSuccess?.(topic);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRenameTopic(projectId: string, channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, title }: { topicId: string; title: string }) =>
      renameTopic(projectId, channelId, topicId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics", projectId, channelId] });
    },
    onError: () => { /* silent — rename is best-effort */ },
  });
}

// ── Team hooks ───────────────────────────────────────────────────────────────────

export function useTeam(projectId: string) {
  return useQuery({
    queryKey: ["team", projectId],
    queryFn: () => getTeam(projectId),
    enabled: !!projectId,
  });
}

export function useAddTeamMember(projectId: string, onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { user_id: string; role?: string }) =>
      addTeamMember(projectId, payload),
    onSuccess: () => {
      toast.success("Member added");
      qc.invalidateQueries({ queryKey: ["team", projectId] });
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveTeamMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(projectId, userId),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["team", projectId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAvailableUsers(projectId: string, search = "") {
  return useQuery({
    queryKey: ["available-users", projectId, search],
    queryFn: () => getAvailableUsers(projectId, search),
    enabled: !!projectId,
  });
}

export function useAvailablePersonas(projectId: string) {
  return useQuery({
    queryKey: ["available-personas", projectId],
    queryFn: () => getAvailablePersonas(projectId),
    enabled: !!projectId,
  });
}
