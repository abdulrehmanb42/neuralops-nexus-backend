"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Shown when the app is served over plain HTTP from a non-localhost origin
// (window.isSecureContext === false). There, the sign-in token and all traffic
// to the NeuralOps server travel unencrypted and can be read on the network —
// fine for local testing, not for real use. Mounted-gated so SSR and the first
// client paint agree (window is absent on the server).
export function InsecureContextNotice({ className }: { className?: string }) {
  const [insecure, setInsecure] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setInsecure(!window.isSecureContext));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!insecure) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] leading-snug text-warn",
        className,
      )}
    >
      <ShieldAlert size={15} strokeWidth={2} className="mt-0.5 flex-none" />
      <span>
        <b>Insecure connection.</b> This app is on plain HTTP, so your session and messages aren&apos;t encrypted
        and could be read on your network. Fine for local testing — for real use, put it behind HTTPS (a TLS
        reverse proxy, a domain with a certificate, or Tailscale).
      </span>
    </div>
  );
}
