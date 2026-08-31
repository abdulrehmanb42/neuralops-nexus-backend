import type { NextConfig } from "next";

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
  // Bottom-left would sit on top of the profile button in the server rail.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
