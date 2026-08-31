import { mcpOAuthAuthorize } from "@/lib/api/intelligence";

// Drives the MCP-server OAuth2 authorization-code flow from the browser.
//
// Backend contract (nucleus): GET /oauth/authorize/?frontend_origin= returns a
// provider consent URL. The provider redirects to nucleus's PUBLIC callback,
// which exchanges the code, stores tokens, and posts back to window.opener:
//   { type: "mcp-oauth-result", ok, server_id, error }
// targeted at the frontend_origin we signed in. We open the consent URL in a
// popup and resolve when that message arrives.
//
// This is the glue file the classic app referenced but never shipped.

export class OAuthPopupError extends Error {
  constructor(message: string, readonly code: "blocked" | "cancelled" | "timeout" | "denied" | "network") {
    super(message);
    this.name = "OAuthPopupError";
  }
}

const POPUP_W = 640;
const POPUP_H = 720;
const TIMEOUT_MS = 5 * 60 * 1000; // give the user time to sign in + consent

interface OAuthResult {
  type: "mcp-oauth-result";
  ok: boolean;
  server_id: string;
  error?: string;
}

function isResult(v: unknown): v is OAuthResult {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "mcp-oauth-result";
}

export async function connectMcpOAuth(
  serverId: string,
  serverUrl: string | null,
  // Reconcile with the backend when the popup closes without a postMessage —
  // the result message can be missed (races, extensions, opener quirks), but
  // the OAuth exchange still completed server-side. Returns true if the server
  // is now connected. Without it, a closed popup is treated as "cancelled".
  verifyConnected?: () => Promise<boolean>,
): Promise<void> {
  // Where the backend should post the result TO: our own window's origin.
  const frontendOrigin = window.location.origin;
  // Where the result comes FROM: the backend serves the callback page, so its
  // postMessage arrives with event.origin === the SERVER's origin (e.g. the
  // nucleus host), NOT ours. Trust only that origin for the result — this
  // rejects a stray page trying to spoof a "connected". If the server URL
  // can't be parsed we fall back to no origin filter (server_id match + the
  // browser's targetOrigin delivery still apply).
  let serverOrigin: string | null = null;
  try { serverOrigin = serverUrl ? new URL(serverUrl).origin : null; } catch { /* unparseable serverUrl */ }
  // A scheme-less URL parses to the literal origin "null" (no throw) — treat
  // that as "no filter" too, else no real event.origin could ever match it and
  // every legit result would be silently rejected.
  if (serverOrigin === "null") serverOrigin = null;

  // 1) Ask nucleus for the provider consent URL (may 400 if not oauth2, 403
  //    without the right, etc. — surfaces as a normal ApiError).
  let authorizeUrl: string;
  try {
    ({ authorize_url: authorizeUrl } = await mcpOAuthAuthorize(serverId, frontendOrigin));
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    if (raw) console.error("[mcp-oauth] authorize request failed:", raw);
    // A 5xx from a misconfigured server can surface as a raw stack trace / HTML
    // body — never surface that in a toast. Pass it through only when it's a
    // short, clean message (e.g. a 400/403 detail); otherwise say it plainly.
    const clean = raw && raw.length <= 140 && !/traceback|<\/?[a-z]|\n/i.test(raw)
      ? raw
      : "Couldn't start the sign-in — the server returned an error. Check it's reachable and set up for OAuth, then try again.";
    throw new OAuthPopupError(clean, "network");
  }

  // 2) Open the popup. A popup blocker returns null — tell the user plainly
  //    (this must be called from a user gesture / click handler).
  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  const popup = window.open(
    authorizeUrl,
    // Per-server window name so a second connect can't hijack an in-flight one.
    `mcp-oauth-${serverId}`,
    `popup,width=${POPUP_W},height=${POPUP_H},left=${Math.round(left)},top=${Math.round(top)}`,
  );
  if (!popup) {
    throw new OAuthPopupError("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.", "blocked");
  }

  // 3) Race: the postMessage result, the popup being closed, or a timeout.
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
      clearTimeout(timeoutTimer);
      try { if (!popup.closed) popup.close(); } catch { /* cross-origin close race — ignore */ }
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      // The backend callback (served from the server origin) posts the result;
      // trust only that origin, and only for THIS server.
      if (serverOrigin && event.origin !== serverOrigin) return;
      if (!isResult(event.data) || event.data.server_id !== serverId) return;
      if (event.data.ok) finish(resolve);
      else finish(() => reject(new OAuthPopupError(event.data.error || "The provider denied the connection.", "denied")));
    };
    window.addEventListener("message", onMessage);

    // Popup closed without a message. Before concluding "cancelled", reconcile
    // with the backend — the sign-in may have completed but the postMessage was
    // missed (this is the reliable completion path; postMessage is the fast one).
    const closedTimer = window.setInterval(() => {
      if (!popup.closed || settled) return;
      clearInterval(closedTimer); // stop polling; the async reconcile settles it
      const cancelled = () => reject(new OAuthPopupError("Sign-in was cancelled.", "cancelled"));
      if (!verifyConnected) { finish(cancelled); return; }
      verifyConnected()
        .then((ok) => finish(ok ? resolve : cancelled))
        .catch(() => finish(cancelled));
    }, 500);

    const timeoutTimer = window.setTimeout(
      () => finish(() => reject(new OAuthPopupError("The sign-in window timed out. Try connecting again.", "timeout"))),
      TIMEOUT_MS,
    );
  });
}
