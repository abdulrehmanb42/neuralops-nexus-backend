"use client";

import { Centrifuge, type Subscription } from "centrifuge";

// One client per server URL. SECURITY INVARIANT: subscribe only to channels
// for topics the user has open — the server has no per-channel auth today,
// so this registry is the isolation enforcement point. Nothing here may ever
// subscribe broadly.

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

let client: Centrifuge | null = null;
let clientUrl: string | null = null;
const subs = new Map<string, { sub: Subscription; listeners: number }>();
const statusListeners = new Set<(s: ConnectionStatus) => void>();
let status: ConnectionStatus = "disconnected";

function setStatus(s: ConnectionStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

export function onConnectionStatus(listener: (s: ConnectionStatus) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

function ensureClient(serverUrl: string): Centrifuge {
  if (client && clientUrl === serverUrl) return client;
  teardownRealtime();
  const wsUrl = serverUrl.replace(/^http/, "ws") + "/connection/websocket";
  client = new Centrifuge(wsUrl);
  clientUrl = serverUrl;
  client.on("connecting", () => setStatus("connecting"));
  client.on("connected", () => setStatus("connected"));
  client.on("disconnected", () => setStatus("disconnected"));
  client.connect();
  return client;
}

export function subscribeTopic(serverUrl: string, topicId: string, onEvent: (data: unknown) => void): () => void {
  const c = ensureClient(serverUrl);
  const channel = `topic-${topicId}`;
  let entry = subs.get(channel);
  if (!entry) {
    entry = { sub: c.newSubscription(channel), listeners: 0 };
    subs.set(channel, entry);
    entry.sub.subscribe();
  }
  entry.listeners += 1;
  const handler = (ctx: { data: unknown }) => onEvent(ctx.data);
  entry.sub.on("publication", handler);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.sub.off("publication", handler);
    entry.listeners -= 1;
    // Last listener gone → leave the channel entirely (the invariant).
    if (entry.listeners <= 0) {
      entry.sub.unsubscribe();
      c.removeSubscription(entry.sub);
      subs.delete(channel);
    }
  };
}

export function teardownRealtime() {
  for (const { sub } of subs.values()) sub.unsubscribe();
  subs.clear();
  client?.disconnect();
  client = null;
  clientUrl = null;
  setStatus("disconnected");
}
