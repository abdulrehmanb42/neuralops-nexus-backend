import { cn } from "@/lib/utils";

// The app's one section-header pattern: slim typographic title + muted
// one-liner, actions on the same baseline, hairline divider underneath.
export function SectionHeader({ title, blurb, actions, className }: {
  title: string;
  blurb?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3.5", className)}>
      <div className="min-w-0 flex-1 basis-64">
        <h2 className="font-display text-[16px] font-bold">{title}</h2>
        {blurb && <p className="mt-0.5 truncate text-[12.5px] text-ink2" title={blurb}>{blurb}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </header>
  );
}
