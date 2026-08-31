import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("nx-shimmer rounded-lg bg-surface2", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent shadow-[0_0_28px_-6px_var(--accent-soft)] [&>svg]:size-6">{icon}</div>}
      <p className="font-display text-[16px] font-bold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[13.5px] text-ink2">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
