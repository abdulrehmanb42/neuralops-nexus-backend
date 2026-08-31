"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SavedServer {
  id: string;
  name: string;
  url: string;
  lastConnected?: string;
  // When the entry was (re-)added — a tombstone older than this must not
  // delete a server the user just added back (lastConnected alone is unset
  // until the first successful connect).
  addedAt?: string;
}

interface ServersState {
  servers: SavedServer[];
  // Tombstones for the account mirror: lowercased url → when it was removed.
  // Without them, a removal on this device gets resurrected by the next pull.
  removed: Record<string, string>;
  add: (name: string, url: string) => SavedServer;
  remove: (id: string) => void;
  touch: (id: string) => void;
}

const normalize = (url: string) => url.trim().replace(/\/+$/, "");

export const useServersStore = create<ServersState>()(
  persist(
    (set, get) => ({
      servers: [],
      removed: {},
      add: (name, url) => {
        const clean = normalize(url);
        if (get().servers.some((s) => s.url.toLowerCase() === clean.toLowerCase()))
          throw new Error("That server is already in your list.");
        const server: SavedServer = { id: crypto.randomUUID(), name: name.trim(), url: clean, addedAt: new Date().toISOString() };
        const removed = { ...get().removed };
        delete removed[clean.toLowerCase()]; // re-adding revokes the tombstone
        set({ servers: [...get().servers, server], removed });
        return server;
      },
      remove: (id) => {
        const target = get().servers.find((s) => s.id === id);
        set({
          servers: get().servers.filter((s) => s.id !== id),
          removed: target
            ? { ...get().removed, [target.url.toLowerCase()]: new Date().toISOString() }
            : get().removed,
        });
      },
      touch: (id) =>
        set({
          servers: get().servers.map((s) => (s.id === id ? { ...s, lastConnected: new Date().toISOString() } : s)),
        }),
    }),
    { name: "nx-servers" },
  ),
);
