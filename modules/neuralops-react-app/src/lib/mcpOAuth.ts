import { getMCPOAuthAuthorizeUrl } from "@/services/mcp-servers.service";
import { useAuthStore } from "@/store/auth.store";

// Drives the MCP-server OAuth2 authorization-code flow from the browser.
//
// Backend contract (nucleus, intelligence/api.py): GET /oauth/authorize/
// returns the provider consent URL; the provider redirects to nucleus's
// PUBLIC callback, which exchanges the code, stores the tokens, and posts
//   { type: "mcp-oauth-result", ok, server_id, error }
// back to window.opener, targeted at our origin (signed into state). We open
// the consent URL in a popup and settle on that message, the popup closing,
// or a timeout.

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

export async function connectMcpOAuth(serverId: string): Promise<void> {
  // The result message is posted by the callback page, which nucleus serves —
  // so it arrives with event.origin === the SERVER's origin, not ours. Trust
  // only that origin (plus the server_id match) so a stray page can't spoof
  // a "connected" result. Unparseable server URL → no origin filter.
  let serverOrigin: string | null = null;
  try {
    const { serverUrl } = useAuthStore.getState();
    serverOrigin = serverUrl ? new URL(serverUrl).origin : null;
  } catch {
    serverOrigin = null;
  }
  if (serverOrigin === "null") serverOrigin = null;

  const authorizeUrl = await getMCPOAuthAuthorizeUrl(serverId);

  // Popup blockers return null — this must run from a click handler.
  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  const popup = window.open(
    authorizeUrl,
    // Per-server window name so a second connect can't hijack an in-flight one.
    `mcp-oauth-${serverId}`,
    `popup,width=${POPUP_W},height=${POPUP_H},left=${Math.round(left)},top=${Math.round(top)}`,
  );
  if (!popup) {
    throw new Error(
      "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    );
  }

  // Race: the postMessage result, the popup being closed, or a timeout.
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
      clearTimeout(timeoutTimer);
      try {
        if (!popup.closed) popup.close();
      } catch {
        // cross-origin close race — ignore
      }
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      if (serverOrigin && event.origin !== serverOrigin) return;
      if (!isResult(event.data) || event.data.server_id !== serverId) return;
      if (event.data.ok) finish(resolve);
      else
        finish(() => reject(new Error(event.data.error || "The provider denied the connection.")));
    };
    window.addEventListener("message", onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new Error("Sign-in was cancelled.")));
    }, 500);

    const timeoutTimer = window.setTimeout(
      () => finish(() => reject(new Error("The sign-in window timed out. Try connecting again."))),
      TIMEOUT_MS,
    );
  });
}
