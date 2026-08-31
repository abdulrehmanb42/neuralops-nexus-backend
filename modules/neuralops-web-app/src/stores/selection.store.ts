"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useConnectionStore } from "./connection.store";

// Workspace navigation state. Deliberately NOT in the URL: project/channel/chat
// ids never appear in the address bar, browser history, or referrers
// (privacy/security requirement). Persisted per server so a refresh reopens
// where you left off.
export interface WorkspaceSelection {
  pid: string;
  cid: string;
  tid?: string;
}

interface SelectionState {
  byServer: Record<string, WorkspaceSelection | undefined>;
  setChannel: (serverUrl: string, pid: string, cid: string) => void;
  setTopic: (serverUrl: string, pid: string, cid: string, tid: string) => void;
  clearTopic: (serverUrl: string) => void;
  clearSelection: (serverUrl: string) => void;
}

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      byServer: {},
      setChannel: (serverUrl, pid, cid) =>
        set((s) => ({ byServer: { ...s.byServer, [serverUrl]: { pid, cid } } })),
      setTopic: (serverUrl, pid, cid, tid) =>
        set((s) => ({ byServer: { ...s.byServer, [serverUrl]: { pid, cid, tid } } })),
      clearTopic: (serverUrl) =>
        set((s) => {
          const cur = s.byServer[serverUrl];
          return cur ? { byServer: { ...s.byServer, [serverUrl]: { pid: cur.pid, cid: cur.cid } } } : s;
        }),
      clearSelection: (serverUrl) =>
        set((s) => ({ byServer: { ...s.byServer, [serverUrl]: undefined } })),
    }),
    { name: "nx-selection" },
  ),
);

// Bound to the connected server: read the current selection + navigate.
export function useSelection() {
  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const sel = useSelectionStore((s) => (serverUrl ? s.byServer[serverUrl] : undefined));
  const store = useSelectionStore.getState();
  return {
    sel,
    setChannel: (pid: string, cid: string) => serverUrl && store.setChannel(serverUrl, pid, cid),
    setTopic: (pid: string, cid: string, tid: string) => serverUrl && store.setTopic(serverUrl, pid, cid, tid),
    clearTopic: () => serverUrl && store.clearTopic(serverUrl),
    clearSelection: () => serverUrl && store.clearSelection(serverUrl),
  };
}
