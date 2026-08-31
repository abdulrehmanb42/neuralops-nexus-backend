import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Server, Trash2 } from "lucide-react";
import type { ServerEntry } from "@/types";
import type { ServerVersionDrift } from "@/lib/version";

interface Props {
  server: ServerEntry;
  onConnect: (server: ServerEntry) => void;
  onRemove: (id: string) => void;
  connecting?: boolean;
  connected?: boolean;
  error?: string | null;
  warning?: string | null;
  // #170 -- pre-connect version preview, from GET /auth/config/. undefined
  // while still loading; null if the server was unreachable.
  serverVersion?: string | null;
  versionDrift?: ServerVersionDrift;
}

function formatLastConnected(ts?: number): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ServerCard({
  server,
  onConnect,
  onRemove,
  connecting,
  connected,
  error,
  warning,
  serverVersion,
  versionDrift,
}: Props) {
  const last = formatLastConnected(server.lastConnected);
  const blocked = versionDrift === "breaking";

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary-tint text-primary">
            <Server className="h-4 w-4" />
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                connected ? "bg-emerald-500" : "bg-muted-foreground/50"
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate font-medium">{server.name}</div>
              {serverVersion && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    versionDrift === "breaking"
                      ? "bg-destructive/10 text-destructive"
                      : versionDrift === "minor"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  v{serverVersion}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-foreground-muted">{server.url}</div>
            {last && (
              <div className="mt-0.5 text-[11px] text-foreground-muted">Last connected {last}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onConnect(server)} disabled={connecting || blocked}>
            {connecting ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Connecting…
              </>
            ) : connected ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />
                Connected
              </>
            ) : blocked ? (
              "Update required"
            ) : (
              "Connect"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(server.id)}
            aria-label="Remove server"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {!error && warning && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
          {warning}
        </p>
      )}
    </Card>
  );
}
