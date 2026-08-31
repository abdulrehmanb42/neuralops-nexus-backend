"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ServerConnection {
  serverUrl: string;
  nucleusUserId?: string; // this server's own user id — NOT the identity-provider id
  role: string | null;
  isOwner: boolean;
  companyName: string | null;
  serverVersion: string | null;
  moduleVersions: { nucleus?: string; nexusAi?: string; transport?: string };
}

interface ConnectionState {
  // Supabase identity (token lives in memory only; the Supabase SDK owns persistence).
  token: string | null;
  userId: string | null;
  email: string | null;
  // Active server connection (persisted so a reload lands back in the workspace).
  serverUrl: string | null;
  connection: ServerConnection | null;
  hydrated: boolean;
  setIdentity: (token: string, userId: string, email: string) => void;
  clearIdentity: () => void;
  connect: (c: ServerConnection) => void;
  disconnect: () => void;
}

type PersistedConnection = Pick<ConnectionState, "serverUrl" | "connection">;

export const useConnectionStore = create<ConnectionState>()(
  persist<ConnectionState, [], [], PersistedConnection>(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      serverUrl: null,
      connection: null,
      hydrated: false,
      setIdentity: (token, userId, email) => set({ token, userId, email }),
      clearIdentity: () => set({ token: null, userId: null, email: null, serverUrl: null, connection: null }),
      connect: (connection) => set({ connection, serverUrl: connection.serverUrl }),
      disconnect: () => set({ connection: null, serverUrl: null }),
    }),
    {
      name: "nx-connection",
      partialize: (s): PersistedConnection => ({ serverUrl: s.serverUrl, connection: s.connection }),
      // NOTE: no onRehydrateStorage — with synchronous localStorage hydration
      // it runs inside create() and dereferencing the store const is a TDZ
      // error that zustand swallows. `hydrated` is owned by SupabaseSessionSync
      // (fires on INITIAL_SESSION, signed in or not).
    },
  ),
);
