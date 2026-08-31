"use client";

import { useEffect, useState } from "react";

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return true;
  const p = `${navigator.platform ?? ""} ${(navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ""}`;
  return /mac|iphone|ipad/i.test(p);
}

// Hydration-safe: SSR and first client paint agree on "⌘K"; the real
// platform label lands right after mount.
export function useSearchShortcut(): string {
  const [label, setLabel] = useState("⌘K");
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLabel(isMacLike() ? "⌘K" : "Ctrl+K"));
    return () => cancelAnimationFrame(raf);
  }, []);
  return label;
}
