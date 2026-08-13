import { apiJson } from "./api-client";
import type { PersonaSchedule } from "@/types";

// Schedules are topic-scoped -- every endpoint needs the full
// project/channel/topic path, same as messages.service.ts.
function base(projectId: string, channelId: string, topicId: string) {
  return `/api/v1/projects/${projectId}/channels/${channelId}/topics/${topicId}/schedules/`;
}

// Lightweight event bus so any component that shows a schedule count/badge
// (ChatArea's header button) can refresh itself after a create/pause/resume/
// delete happens somewhere else (e.g. MessageInput's /schedule form), without
// wiring prop callbacks through every intermediate component. The backend
// also announces every lifecycle change as a system message in the topic
// itself (see scheduling/api.py:_announce) -- this event is purely for
// keeping the on-screen badge count in sync, not a substitute for that.
export const SCHEDULES_CHANGED_EVENT = "neuralops:schedules-changed";

function notifyChanged() {
  window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT));
}

export async function listSchedules(
  projectId: string,
  channelId: string,
  topicId: string,
): Promise<PersonaSchedule[]> {
  return apiJson<PersonaSchedule[]>(base(projectId, channelId, topicId));
}

export interface CreateScheduleInput {
  persona_id: string;
  query_text: string;
  label?: string;
  schedule_kind: "interval" | "crontab" | "clocked";
  interval_every?: number;
  interval_period?: "minutes" | "hours" | "days" | "weeks";
  crontab_minute?: string;
  crontab_hour?: string;
  crontab_day_of_week?: string;
  crontab_day_of_month?: string;
  crontab_month_of_year?: string;
  clocked_time?: string; // ISO 8601, UTC
  timezone?: string;
  trigger_visible?: boolean;
  catch_up_missed?: boolean;
}

export async function createSchedule(
  projectId: string,
  channelId: string,
  topicId: string,
  input: CreateScheduleInput,
): Promise<PersonaSchedule> {
  const result = await apiJson<PersonaSchedule>(base(projectId, channelId, topicId), {
    method: "POST",
    body: JSON.stringify(input),
  });
  notifyChanged();
  return result;
}

export async function updateSchedule(
  projectId: string,
  channelId: string,
  topicId: string,
  scheduleId: string,
  input: { query_text?: string; label?: string; is_paused?: boolean },
): Promise<PersonaSchedule> {
  const result = await apiJson<PersonaSchedule>(`${base(projectId, channelId, topicId)}${scheduleId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  notifyChanged();
  return result;
}

export async function deleteSchedule(
  projectId: string,
  channelId: string,
  topicId: string,
  scheduleId: string,
): Promise<void> {
  await apiJson<void>(`${base(projectId, channelId, topicId)}${scheduleId}/`, {
    method: "DELETE",
  });
  notifyChanged();
}
