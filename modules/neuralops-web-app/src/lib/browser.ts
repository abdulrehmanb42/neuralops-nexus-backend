"use client";

// Browser APIs gated to a *secure context* (HTTPS or localhost). A self-hosted
// deployment reached over http://<LAN-IP> is NOT a secure context, so these
// APIs are absent there — every helper below degrades instead of throwing.

// crypto.randomUUID is secure-context-only; crypto.getRandomValues is not, so
// build a v4 UUID from it. Final fallback is non-crypto on purpose — these ids
// are local list keys (saved servers), not security tokens.
export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// navigator.clipboard is secure-context-only; fall back to the legacy
// execCommand("copy") through an off-screen textarea so copy buttons keep
// working over plain HTTP. Resolves to whether the copy actually landed, so
// callers can toast success/failure instead of assuming success.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or blocked — fall through to the legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
