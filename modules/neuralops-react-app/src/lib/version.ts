// ─── App Version ────────────────────────────────────────────────────────────
// Increment this on every meaningful change.
// Format: MAJOR.MINOR  (e.g. 0.1, 0.2, 1.0)
// Documented in DECISIONS.md § 15.

export const APP_VERSION = "0.1.2";
export const APP_STAGE = "Alpha";
export const APP_NAME = "NeuralOps";

// ─── Self-host server compatibility (#170) ─────────────────────────────────
// The FAT_VERSION this frontend build expects. Compared against
// `server_version` (from GET /api/v1/auth/config/ pre-connect, and
// GET /api/v1/auth/verify/ post-connect -- see ServerList.tsx) via
// compareServerVersion() below. Pre-1.0 (major 0), a MINOR difference is
// treated as the breaking-change signal -- standard semver practice, since
// major stays 0 through the whole alpha period. PATCH-only drift just shows
// a "please update" banner but still lets the connection through. Once we
// cut 1.0, only MAJOR differences will be treated as breaking.
//
// 0.1.2 bump note: this release only changed neuralops/entrypoint.sh
// (init-secrets now also generates POSTGRES_PASSWORD) -- nucleus's actual
// Django API surface didn't change, so this is a real PATCH-only bump.
// A single MAJOR.MINOR.PATCH string is kept deliberately, even though the
// image bundles nucleus + nexus-ai + centrifugo -- they build and ship as
// ONE atomic image from ONE Dockerfile, so there's no such thing as a
// deployed state where they're at different versions from each other.
// Per-component digit groups were considered and rejected: this parser
// only understands dot-separated numeric parts, so encoding nexus-ai's own
// counter into the MINOR slot would make an nexus-ai-only change (which
// this frontend never even talks to directly) misfire as "breaking" here.
export const COMPATIBLE_SERVER_VERSION = "0.1.2";

export type ServerVersionDrift = "match" | "minor" | "breaking" | "unknown";

function parseSemver(v: string): [number, number, number] | null {
  const m = v.split(".").map((p) => parseInt(p, 10));
  if (m.length < 2 || m.some((n) => Number.isNaN(n))) return null;
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
}

/**
 * Compares a self-hosted server's reported version against
 * COMPATIBLE_SERVER_VERSION. "dev"/"unknown"/missing versions are treated
 * as unknown -- not enough signal to warn or block on.
 *
 * "breaking" (hard block) means: MAJOR differs once we're past 1.0, or
 * MINOR differs while still pre-1.0 (major 0) -- standard semver treats
 * minor as the breaking-change signal for 0.x releases, since major stays
 * 0 through the whole alpha/beta period. PATCH-only differences are just a
 * "minor" drift -- warn, don't block.
 */
export function compareServerVersion(
  serverVersion: string | null | undefined,
): ServerVersionDrift {
  if (!serverVersion || serverVersion === "dev" || serverVersion === "unknown") {
    return "unknown";
  }
  if (serverVersion === COMPATIBLE_SERVER_VERSION) return "match";

  const server = parseSemver(serverVersion);
  const app = parseSemver(COMPATIBLE_SERVER_VERSION);
  if (!server || !app) return "unknown";

  const [sMajor, sMinor] = server;
  const [aMajor, aMinor] = app;

  if (sMajor !== aMajor) return "breaking";
  if (aMajor === 0 && sMinor !== aMinor) return "breaking";
  return "minor";
}
