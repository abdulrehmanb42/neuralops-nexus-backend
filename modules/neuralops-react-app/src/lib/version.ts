// ─── App Version ────────────────────────────────────────────────────────────
// Increment this on every meaningful change.
// Format: MAJOR.MINOR  (e.g. 0.1, 0.2, 1.0)
// Documented in DECISIONS.md § 15.

export const APP_VERSION = "0.1.2";
export const APP_STAGE = "Alpha";
export const APP_NAME = "NeuralOps";

// ─── Self-host server compatibility (#170) ─────────────────────────────────
// The FAT_VERSION this frontend build expects. Compared exactly against
// `server_version` from GET /api/v1/auth/verify/ on every connect (see
// ServerList.tsx) -- any difference (server older OR newer) shows a banner
// telling the self-hoster to run `./install.sh update`. Doesn't block the
// connection; just makes drift visible instead of silently failing in
// confusing ways (e.g. missing fields, stale assets baked into an old image).
export const COMPATIBLE_SERVER_VERSION = "0.1.0";
