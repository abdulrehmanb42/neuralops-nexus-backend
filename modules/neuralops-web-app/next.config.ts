import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Dev-only. `next dev` blocks cross-origin requests to its own dev resources,
// which breaks reaching the dev server over a LAN IP (self-hosting and opening
// it from another machine — the exact case where crypto.randomUUID/clipboard
// also break). Auto-allow this host's own LAN addresses so that setup works
// with zero config, plus anything in NEXT_DEV_ALLOWED_ORIGINS (comma-separated,
// for Tailscale hostnames / domains that aren't local IPs). Ignored entirely by
// the production build.
function devAllowedOrigins(): string[] {
  const env = process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && !n.internal && n.family === "IPv4")
    .map((n) => n.address);
  return [...new Set([...lan, ...env])];
}

// Baseline security headers. A strict CSP is scheduled for the hardening
// milestone (needs nonce plumbing for the theme boot script + Next runtime).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Emits .next/standalone for the minimal production Docker image.
  output: "standalone",
  allowedDevOrigins: devAllowedOrigins(),
  // Bottom-left would sit on top of the profile button in the server rail.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
