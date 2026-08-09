import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME, APP_STAGE, APP_VERSION } from "@/lib/version";
import { useAuthStore } from "@/store/auth.store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: Props) {
  const serverVersion = useAuthStore((s) => s.serverVersion);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>About {APP_NAME}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold select-none">
            N
          </div>
          <div>
            <div className="text-xl font-semibold">{APP_NAME}</div>
            <div className="mt-1 text-sm text-foreground-muted">
              {APP_STAGE} Version {APP_VERSION}
            </div>
          </div>
          <div className="w-full border-t border-border" />
          <p className="text-xs text-foreground-muted leading-relaxed">
            AI-powered workspace for teams and intelligent personas.
            <br />
            Built with NexusNucleus + NexusAI.
          </p>
          {serverUrl && (
            <>
              <div className="w-full border-t border-border" />
              <div className="w-full text-left text-xs text-foreground-muted">
                <div className="truncate">
                  <span className="font-medium text-foreground">Server:</span> {serverUrl}
                </div>
                {serverVersion && (
                  <div>
                    <span className="font-medium text-foreground">Server version:</span>{" "}
                    {serverVersion}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
