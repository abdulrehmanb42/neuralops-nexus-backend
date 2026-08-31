import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the one API call connectMcpOAuth makes so no network/MSW handler is needed.
vi.mock("@/lib/api/intelligence", () => ({ mcpOAuthAuthorize: vi.fn() }));

import { mcpOAuthAuthorize } from "@/lib/api/intelligence";
import { connectMcpOAuth, OAuthPopupError } from "./mcp-oauth";

// The backend callback is served from the SERVER's origin, so its postMessage
// arrives with event.origin === the server origin — deliberately DIFFERENT from
// the frontend's window.location.origin, which is the bug this guards.
const SERVER_URL = "http://localhost:8096";
const SERVER_ORIGIN = new URL(SERVER_URL).origin;
const FRONTEND_ORIGIN = window.location.origin;
const AUTH_URL = "https://github.com/login/oauth/authorize?client_id=abc";

type FakePopup = { closed: boolean; close: ReturnType<typeof vi.fn> };
const makePopup = (): FakePopup => ({ closed: false, close: vi.fn() });

// Dispatch a postMessage as the backend callback page would (from the server origin).
function post(data: unknown, origin = SERVER_ORIGIN) {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}
const result = (over: Record<string, unknown> = {}) => ({
  type: "mcp-oauth-result", ok: true, server_id: "srv-1", ...over,
});

describe("connectMcpOAuth", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;
  let popup: FakePopup;

  beforeEach(() => {
    vi.mocked(mcpOAuthAuthorize).mockResolvedValue({ authorize_url: AUTH_URL });
    popup = makePopup();
    openSpy = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Kick off a connect and wait until the popup has been opened + the listener is
  // attached, WITHOUT awaiting the returned promise (return it boxed so it stays live).
  async function inFlight(id = "srv-1") {
    const p = connectMcpOAuth(id, SERVER_URL);
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled());
    return { p };
  }

  it("asks the backend for the authorize URL using OUR origin, and opens it", async () => {
    const { p } = await inFlight();
    expect(mcpOAuthAuthorize).toHaveBeenCalledWith("srv-1", FRONTEND_ORIGIN);
    expect(openSpy).toHaveBeenCalledWith(AUTH_URL, "mcp-oauth-srv-1", expect.stringContaining("popup"));
    post(result()); // settle so nothing dangles
    await expect(p).resolves.toBeUndefined();
  });

  it("resolves on ok:true from the SERVER origin for the matching server", async () => {
    const { p } = await inFlight();
    post(result({ ok: true }));
    await expect(p).resolves.toBeUndefined();
    expect(popup.close).toHaveBeenCalled(); // popup is closed on settle
  });

  it("IGNORES a result posted from the frontend's own origin (the callback never does that)", async () => {
    const { p } = await inFlight();
    post(result({ ok: false, error: "spoofed" }), FRONTEND_ORIGIN); // wrong sender → ignored
    post(result({ ok: true }), SERVER_ORIGIN); // the real one still wins
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects with code 'denied' on ok:false (carrying the provider error)", async () => {
    const { p } = await inFlight();
    post(result({ ok: false, error: "access_denied" }));
    await expect(p).rejects.toMatchObject({ name: "OAuthPopupError", code: "denied", message: "access_denied" });
  });

  it("ignores a message from a foreign origin (would have rejected if trusted)", async () => {
    const { p } = await inFlight();
    post(result({ ok: false, error: "spoofed" }), "https://evil.example"); // must be ignored
    post(result({ ok: true })); // the real one still wins
    await expect(p).resolves.toBeUndefined();
  });

  it("ignores a message for a different server_id", async () => {
    const { p } = await inFlight("srv-1");
    post(result({ ok: false, server_id: "srv-2", error: "other" })); // not our server
    post(result({ ok: true, server_id: "srv-1" }));
    await expect(p).resolves.toBeUndefined();
  });

  it("ignores non-result messages (extensions, other libs) from the server origin", async () => {
    const { p } = await inFlight();
    post({ type: "webpackHot", ok: false }); // noise
    post("just a string");
    post(result({ ok: true }));
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects with a 'blocked' OAuthPopupError when the popup is blocked (window.open → null)", async () => {
    openSpy.mockReturnValue(null);
    const p = connectMcpOAuth("srv-1", SERVER_URL);
    await expect(p).rejects.toBeInstanceOf(OAuthPopupError);
    await expect(p).rejects.toMatchObject({ code: "blocked" });
  });

  it("rejects with code 'network' when the authorize call fails", async () => {
    vi.mocked(mcpOAuthAuthorize).mockRejectedValue(new Error("403 Forbidden"));
    await expect(connectMcpOAuth("srv-1", SERVER_URL)).rejects.toMatchObject({ code: "network", message: "403 Forbidden" });
    expect(openSpy).not.toHaveBeenCalled(); // no popup if we never got a URL
  });

  it("does not leak a raw stack trace into the error message (5xx body)", async () => {
    vi.mocked(mcpOAuthAuthorize).mockRejectedValue(new Error("Traceback (most recent call last):\n  File ..."));
    await expect(connectMcpOAuth("srv-1", SERVER_URL)).rejects.toMatchObject({
      code: "network",
      message: expect.not.stringContaining("Traceback"),
    });
  });

  it("still verifies server_id even when the server URL can't be parsed (no origin filter)", async () => {
    const p = connectMcpOAuth("srv-1", "not-a-url");
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled());
    post(result({ ok: false, server_id: "srv-9" }), "https://anything.example"); // wrong server → ignored
    post(result({ ok: true, server_id: "srv-1" }), "https://anything.example"); // accepted (no origin filter)
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects with code 'cancelled' when the user closes the popup", async () => {
    vi.useFakeTimers();
    const p = connectMcpOAuth("srv-1", SERVER_URL);
    const settled = expect(p).rejects.toMatchObject({ code: "cancelled" });
    await vi.advanceTimersByTimeAsync(0); // flush the awaited authorize → popup opens
    expect(openSpy).toHaveBeenCalled();
    popup.closed = true; // user closed it, no message ever posted
    await vi.advanceTimersByTimeAsync(600); // the 500ms poll notices
    await settled;
  });

  it("resolves via backend reconcile when the popup closes but the sign-in DID complete", async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue(true); // backend says connected
    const p = connectMcpOAuth("srv-1", SERVER_URL, verify);
    const settled = expect(p).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    popup.closed = true; // closed without a postMessage (message was missed)
    await vi.advanceTimersByTimeAsync(600);
    await settled;
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("rejects 'cancelled' when the popup closes and the reconcile says not connected", async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue(false); // genuinely not connected
    const p = connectMcpOAuth("srv-1", SERVER_URL, verify);
    const settled = expect(p).rejects.toMatchObject({ code: "cancelled" });
    await vi.advanceTimersByTimeAsync(0);
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(600);
    await settled;
  });

  it("a postMessage still wins over the reconcile (fast path), verify not consulted", async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const p = connectMcpOAuth("srv-1", SERVER_URL, verify);
    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled());
    post(result({ ok: true }));
    await expect(p).resolves.toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects with code 'timeout' after 5 minutes with no response", async () => {
    vi.useFakeTimers();
    const p = connectMcpOAuth("srv-1", SERVER_URL);
    const settled = expect(p).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await settled;
  });

  // The backend callback page does `postMessage(...); window.close();` synchronously,
  // so the popup is already closed by the time we could observe it. This proves the
  // success message still wins over the "closed" poll — a completed sign-in is never
  // misreported as "cancelled".
  it("reports success even though the callback closes the popup right after posting", async () => {
    const { p } = await inFlight();
    popup.closed = true; // callback already ran window.close()...
    post(result({ ok: true })); // ...but its postMessage was delivered first
    await expect(p).resolves.toBeUndefined();
  });

  it("stops listening after settling (a late message can't flip the result)", async () => {
    const { p } = await inFlight();
    post(result({ ok: true }));
    await expect(p).resolves.toBeUndefined();
    // A stray later message must not throw or re-settle.
    expect(() => post(result({ ok: false, error: "late" }))).not.toThrow();
  });
});
