import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <Wordmark className="text-[18px]" />
      <div>
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[.16em] text-accent">404</p>
        <h1 className="mt-1 font-display text-[22px] font-extrabold">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink2">The link may be outdated, or the page moved.</p>
      </div>
      <Link href="/servers" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-5 text-[14px] font-semibold text-accent-ink hover:brightness-110">
        Go to the app
      </Link>
    </div>
  );
}
