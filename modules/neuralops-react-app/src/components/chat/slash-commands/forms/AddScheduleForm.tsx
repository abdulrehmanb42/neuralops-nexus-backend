import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listPersonas } from "@/services/personas.service";
import { createSchedule, type CreateScheduleInput } from "@/services/schedules.service";
import { FormDialog, Field } from "./shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Persona } from "@/types";

// "Repeat" is the friendly, user-facing choice -- it's what actually maps
// onto django-celery-beat's IntervalSchedule/CrontabSchedule/ClockedSchedule
// underneath (see nucleus/models/scheduling.py + scheduling/services.py).
type RepeatMode = "interval" | "daily" | "weekly" | "monthly" | "once";

const WEEKDAYS = [
  { value: "0", label: "Sun" },
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

interface FormState {
  personaId: string;
  queryText: string;
  label: string;
  repeatMode: RepeatMode;
  // interval
  intervalEvery: string;
  intervalPeriod: "minutes" | "hours" | "days" | "weeks";
  // daily/weekly/monthly (crontab)
  time: string; // "HH:MM", 24h
  weekdays: string[]; // for weekly
  dayOfMonth: string; // for monthly
  // once (clocked)
  clockedLocal: string; // datetime-local value
  triggerVisible: boolean;
}

const EMPTY: FormState = {
  personaId: "",
  queryText: "",
  label: "",
  repeatMode: "daily",
  intervalEvery: "1",
  intervalPeriod: "hours",
  time: "09:00",
  weekdays: ["1"],
  dayOfMonth: "1",
  clockedLocal: "",
  triggerVisible: true,
};

function buildPayload(f: FormState): CreateScheduleInput | { error: string } {
  if (!f.personaId) return { error: "Pick a persona." };
  if (!f.queryText.trim()) return { error: "Enter what the persona should be asked." };

  const common = {
    persona_id: f.personaId,
    query_text: f.queryText.trim(),
    label: f.label.trim(),
    timezone: BROWSER_TZ,
    trigger_visible: f.triggerVisible,
  };

  if (f.repeatMode === "interval") {
    const n = Number(f.intervalEvery);
    if (!n || n <= 0) return { error: "Interval must be a positive number." };
    return { ...common, schedule_kind: "interval", interval_every: n, interval_period: f.intervalPeriod };
  }

  if (f.repeatMode === "once") {
    if (!f.clockedLocal) return { error: "Pick a date and time." };
    const dt = new Date(f.clockedLocal); // parsed as local time by the browser
    if (Number.isNaN(dt.getTime())) return { error: "Invalid date/time." };
    if (dt.getTime() <= Date.now()) return { error: "Pick a time in the future." };
    return { ...common, schedule_kind: "clocked", clocked_time: dt.toISOString() };
  }

  // daily / weekly / monthly all map to crontab
  const [hh, mm] = f.time.split(":");
  if (f.repeatMode === "weekly" && f.weekdays.length === 0) {
    return { error: "Pick at least one day of the week." };
  }
  if (f.repeatMode === "monthly" && (!f.dayOfMonth || Number(f.dayOfMonth) < 1 || Number(f.dayOfMonth) > 31)) {
    return { error: "Day of month must be 1-31." };
  }
  return {
    ...common,
    schedule_kind: "crontab",
    crontab_minute: String(Number(mm)),
    crontab_hour: String(Number(hh)),
    crontab_day_of_week: f.repeatMode === "weekly" ? f.weekdays.join(",") : "*",
    crontab_day_of_month: f.repeatMode === "monthly" ? f.dayOfMonth : "*",
    crontab_month_of_year: "*",
  };
}

export function AddScheduleForm({
  open,
  onClose,
  projectId,
  channelId,
  topicId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  channelId?: string | null;
  topicId?: string | null;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listPersonas(projectId).then(setPersonas).catch(() => {});
  }, [open, projectId]);

  function set<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !channelId || !topicId) {
      toast.error("Open a topic first -- schedules belong to a topic.");
      return;
    }
    const payload = buildPayload(form);
    if ("error" in payload) {
      toast.error(payload.error);
      return;
    }
    setSaving(true);
    try {
      await createSchedule(projectId, channelId, topicId, payload);
      toast.success("Schedule created");
      setForm(EMPTY);
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title="Schedule a Persona" open={open} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 mt-2">
        <Field label="Persona *">
          <Select value={form.personaId} onValueChange={(v) => setForm((f) => ({ ...f, personaId: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a persona" />
            </SelectTrigger>
            <SelectContent>
              {personas.map((p) => (
                <SelectItem key={p.id} value={p.id}>@{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Query *">
          <Textarea
            value={form.queryText}
            onChange={set("queryText")}
            rows={2}
            placeholder="Summarize open items in this project and flag anything overdue"
            autoFocus
          />
        </Field>

        <Field label="Label">
          <Input value={form.label} onChange={set("label")} placeholder={'Optional, e.g. "Daily standup digest"'} />
        </Field>

        <Field label="Repeat">
          <Select value={form.repeatMode} onValueChange={(v) => setForm((f) => ({ ...f, repeatMode: v as RepeatMode }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interval">Every N minutes/hours/days</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="once">Once, on a specific date</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {form.repeatMode === "interval" && (
          <div className="flex gap-2">
            <Field label="Every">
              <Input
                type="number"
                min={1}
                value={form.intervalEvery}
                onChange={set("intervalEvery")}
                className="w-24"
              />
            </Field>
            <Field label="Unit">
              <Select
                value={form.intervalPeriod}
                onValueChange={(v) => setForm((f) => ({ ...f, intervalPeriod: v as FormState["intervalPeriod"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {(form.repeatMode === "daily" || form.repeatMode === "weekly" || form.repeatMode === "monthly") && (
          <Field label={`Time (${BROWSER_TZ})`}>
            <Input type="time" value={form.time} onChange={set("time")} className="w-32" />
          </Field>
        )}

        {form.repeatMode === "weekly" && (
          <Field label="Days of week">
            <ToggleGroup
              type="multiple"
              value={form.weekdays}
              onValueChange={(v) => setForm((f) => ({ ...f, weekdays: v }))}
              className="justify-start"
            >
              {WEEKDAYS.map((d) => (
                <ToggleGroupItem key={d.value} value={d.value} className="text-xs px-2.5">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}

        {form.repeatMode === "monthly" && (
          <Field label="Day of month">
            <Input type="number" min={1} max={31} value={form.dayOfMonth} onChange={set("dayOfMonth")} className="w-24" />
          </Field>
        )}

        {form.repeatMode === "once" && (
          <Field label="Date & time">
            <Input type="datetime-local" value={form.clockedLocal} onChange={set("clockedLocal")} />
          </Field>
        )}

        <Field label="Post a visible message when it fires">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.triggerVisible}
              onCheckedChange={(v) => setForm((f) => ({ ...f, triggerVisible: v }))}
            />
            <span className="text-xs text-muted-foreground">
              {form.triggerVisible ? "Yes -- posts \"Scheduled: ...\" before the persona replies" : "No -- fires silently"}
            </span>
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !form.personaId || !form.queryText.trim()}>
            {saving ? "Saving…" : "Create schedule"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
