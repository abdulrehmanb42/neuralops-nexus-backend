"use client";

import { supabase } from "@/lib/supabase";
import { useServersStore, type SavedServer } from "@/stores/servers.store";

// The saved-server list follows the ACCOUNT, not the browser: mirrored into
// the identity provider's user metadata so a fresh browser shows your
// launcher after sign-in. Server addresses go only to the auth account the
// user already trusts with their identity — never to any third party.
//
// Removals travel as tombstones (nx_servers_removed: url → removedAt) so a
// server removed on one device disappears everywhere instead of being
// resurrected by the next merge. A connection newer than the tombstone wins.

type RemoteServer = Partial<SavedServer> & { url?: string };

// Push gate: mirroring before this device has merged the account's own list
// would overwrite the remote list with a stale or empty local one.
let pulled = false;

export async function pullServers(): Promise<void> {
  try {
    const { data, error } = await supabase().auth.getUser();
    if (error || !data.user) return; // signed out — keep the push gate closed
    const meta = data.user.user_metadata ?? {};
    const remote = (meta.nx_servers as RemoteServer[] | undefined) ?? [];
    const remoteRemoved = (meta.nx_servers_removed as Record<string, string> | undefined) ?? {};
    const { servers, removed } = useServersStore.getState();
    const byUrl = new Map(servers.map((s) => [s.url.toLowerCase(), s]));
    const mergedRemoved = { ...removed };
    let changed = false;
    // "When was this entry last meaningfully alive" — connect time when known,
    // else when it was added. Tombstones only beat entries older than both.
    const aliveAt = (s: { lastConnected?: string; addedAt?: string }) => s.lastConnected ?? s.addedAt ?? "";
    if (Array.isArray(remote)) {
      for (const r of remote) {
        if (!r?.url || typeof r.url !== "string") continue;
        const url = r.url.trim().replace(/\/+$/, ""); // normalize like add() — a raw remote entry must not duplicate a clean local one
        const key = url.toLowerCase();
        const tomb = mergedRemoved[key];
        if (tomb && aliveAt(r) <= tomb) continue; // removed here after its last use
        const local = byUrl.get(key);
        if (!local) {
          byUrl.set(key, {
            id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
            name: typeof r.name === "string" && r.name ? r.name : url,
            url,
            lastConnected: typeof r.lastConnected === "string" ? r.lastConnected : undefined,
            addedAt: typeof r.addedAt === "string" ? r.addedAt : undefined,
          });
          changed = true;
        } else if ((r.lastConnected ?? "") > (local.lastConnected ?? "")) {
          byUrl.set(key, { ...local, lastConnected: r.lastConnected });
          changed = true;
        }
      }
    }
    if (remoteRemoved && typeof remoteRemoved === "object") {
      for (const [key, at] of Object.entries(remoteRemoved)) {
        if (typeof at !== "string") continue;
        if (!mergedRemoved[key] || mergedRemoved[key] < at) {
          mergedRemoved[key] = at;
          changed = true;
        }
        const local = byUrl.get(key);
        if (local && aliveAt(local) <= at) {
          byUrl.delete(key);
          changed = true;
        }
      }
    }
    if (changed) useServersStore.setState({ servers: [...byUrl.values()], removed: mergedRemoved });
    pulled = true;
  } catch {
    /* offline — the local list stands; push stays gated */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function pushServersDebounced(list: SavedServer[], removed: Record<string, string>): void {
  if (!pulled) return; // never mirror before the account's own list merged in
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void supabase()
      .auth.updateUser({ data: { nx_servers: list, nx_servers_removed: removed } })
      .catch(() => undefined); // best-effort background mirror
  }, 1_200);
}

// Sign-out: drop any queued mirror write and force the next account to pull
// before it may push — otherwise the just-cleared local list could wipe the
// account's remote list.
export function cancelPendingPush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pulled = false;
}
