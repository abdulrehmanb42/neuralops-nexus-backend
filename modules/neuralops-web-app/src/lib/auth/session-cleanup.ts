"use client";

import { QueryClient } from "@tanstack/react-query";
import { clearAllDrafts } from "@/lib/chat/drafts";
import { teardownRealtime } from "@/lib/realtime/centrifugo";
import { cancelPendingPush } from "@/lib/servers-sync";
import { useComposerMruStore } from "@/stores/composer-mru.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useSelectionStore } from "@/stores/selection.store";
import { useServersStore } from "@/stores/servers.store";

// One browser-wide QueryClient so account cleanup can also wipe the fetched
// cache — cached members/messages are account-scoped state exactly like the
// persisted stores, just in memory. (Server-side this module renders once per
// request with every query disabled, so a module singleton is safe.)
let client: QueryClient | null = null;
export function getQueryClient(): QueryClient {
  if (!client) client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });
  return client;
}

// EVERYTHING account-scoped dies here, in one place: both sign-out buttons
// AND the auth listener's signed-out path (expiry, revocation, sign-out in
// another tab) call this — a session can end without a button being clicked,
// and a partial cleanup leaks the previous account's data into the next.
export function clearAccountScopedState(): void {
  teardownRealtime();
  cancelPendingPush(); // a queued server-list mirror must never fire after the list clears
  useSelectionStore.setState({ byServer: {} });
  useServersStore.setState({ servers: [], removed: {} });
  useComposerMruStore.getState().clear(); // device-scoped, but wiped for privacy (no leaking recent @personas to the next account)
  clearAllDrafts();
  getQueryClient().clear();
  useConnectionStore.getState().clearIdentity();
}
