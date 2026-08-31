import { apiJson } from "./client";

// topic_id is required by the schema but only used to announce the rename in
// that topic — the server silently skips the announcement when it doesn't
// resolve. Pass "" for a profile-screen rename (no announcement).
export const changeUsername = (newName: string, topicId: string) =>
  apiJson<{ ok: boolean; display_name: string }>("/api/v1/auth/change-username/", {
    method: "POST",
    body: JSON.stringify({ new_name: newName, topic_id: topicId }),
  });

// Server rule (authn/api.py _USERNAME_RE): 2–30 chars, letters/numbers/underscore.
export const USERNAME_RE = /^[a-zA-Z0-9_]{2,30}$/;
