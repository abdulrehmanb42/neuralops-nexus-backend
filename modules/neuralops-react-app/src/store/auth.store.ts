import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthState {
  supabaseToken: string | null;
  userId: string | null;
  email: string | null;
  serverUrl: string | null;
  // populated after server verify
  role: string | null;
  companyName: string | null;
  isOwner: boolean;
  serverVersion: string | null; // #170 -- the connected server's version

  setIdentity: (token: string, userId: string, email: string) => void;
  setServerUrl: (url: string) => void;
  setServerInfo: (info: {
    serverUrl: string;
    userId?: string;
    role?: string;
    companyName?: string;
    isOwner?: boolean;
    serverVersion?: string;
  }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      supabaseToken: null,
      userId: null,
      email: null,
      serverUrl: null,
      role: null,
      companyName: null,
      isOwner: false,
      serverVersion: null,
      setIdentity: (supabaseToken, userId, email) => set({ supabaseToken, userId, email }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setServerInfo: ({ serverUrl, userId, role, companyName, isOwner, serverVersion }) =>
        set({
          serverUrl,
          ...(userId !== undefined && { userId }),
          role: role ?? null,
          companyName: companyName ?? null,
          isOwner: isOwner ?? false,
          serverVersion: serverVersion ?? null,
        }),
      clearAuth: () =>
        set({
          supabaseToken: null,
          userId: null,
          email: null,
          serverUrl: null,
          role: null,
          companyName: null,
          isOwner: false,
          serverVersion: null,
        }),
    }),
    {
      name: "neuralops-auth",
      partialize: (s) => ({
        supabaseToken: s.supabaseToken,
        userId: s.userId,
        email: s.email,
        serverUrl: s.serverUrl,
        role: s.role,
        companyName: s.companyName,
        isOwner: s.isOwner,
        serverVersion: s.serverVersion,
      }),
    },
  ),
);
