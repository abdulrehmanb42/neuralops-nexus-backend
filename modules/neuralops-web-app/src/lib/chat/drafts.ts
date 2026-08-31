"use client";

// Per-topic composer drafts (markdown). Account-scoped by content: cleared on
// sign-out so another account on this browser never sees them (topic ids are
// shared per server). Survives reloads within a session via localStorage.
const DRAFTS_KEY = "nx-drafts";

function load(): Map<string, string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DRAFTS_KEY) : null;
    return new Map(raw ? Object.entries(JSON.parse(raw) as Record<string, string>) : []);
  } catch {
    return new Map();
  }
}

const map = load();

function persist() {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* storage blocked/full — in-memory drafts still work */
  }
}

export const drafts = {
  get: (id: string) => map.get(id),
  set: (id: string, v: string) => {
    if (v) map.set(id, v);
    else map.delete(id);
    persist();
  },
  delete: (id: string) => {
    map.delete(id);
    persist();
  },
};

export function clearAllDrafts(): void {
  map.clear();
  try {
    localStorage.removeItem(DRAFTS_KEY);
  } catch {
    /* nothing to clear */
  }
}
