import { APP_NAME } from "@/lib/version";
import { cn } from "@/lib/utils";

// The Nexus mark: a radiant hub orchestrating orbiting nodes — humans and
// agents coordinated through one shared core. One node runs "live" in green.
export function NexusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <radialGradient id="nx-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".45" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nx-hub" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-deep)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#nx-glow)" />
      {/* orbit */}
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="1" strokeDasharray="2.4 3.2" />
      {/* links: hub → satellites */}
      <g stroke="var(--accent)" strokeOpacity=".75" strokeWidth="1.3" fill="none">
        <line x1="16" y1="16" x2="16" y2="5.5" />
        <line x1="16" y1="16" x2="6.9" y2="21.3" />
        <line x1="16" y1="16" x2="25.1" y2="21.3" />
      </g>
      {/* satellites (one live) */}
      <circle cx="16" cy="5.5" r="2.6" fill="var(--accent)" />
      <circle cx="6.9" cy="21.3" r="2.6" fill="var(--accent)" />
      <circle cx="25.1" cy="21.3" r="2.9" fill="var(--live)" />
      {/* the hub */}
      <circle cx="16" cy="16" r="4.6" fill="url(#nx-hub)" />
      <circle cx="16" cy="16" r="1.7" fill="white" fillOpacity=".92" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display font-extrabold tracking-tight text-ink", className)}>
      <NexusMark />
      {APP_NAME}
    </span>
  );
}
