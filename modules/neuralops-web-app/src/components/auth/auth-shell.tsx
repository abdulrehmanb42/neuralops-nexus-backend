import Link from "next/link";
import { Constellation } from "@/components/brand/constellation";
import { Nebula } from "@/components/brand/nebula";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — the galaxy side. */}
      <div className="relative hidden overflow-hidden border-r border-line bg-bg2 lg:block">
        <Nebula />
        <Constellation />
        <div className="relative flex h-full flex-col p-10">
          <Link href="/" aria-label="Back to the NeuralOps Nexus home page">
            <Wordmark className="text-[19px]" />
          </Link>
          <div className="flex-1" />
          <blockquote className="max-w-md">
            <p className="font-display text-[30px] font-extrabold leading-tight">
              One workspace.<br />
              Humans, personas, agents — <em className="bg-gradient-to-r from-accent to-live bg-clip-text not-italic text-transparent">one shared reality.</em>
            </p>
            <p className="mt-4 text-[14px] text-ink2">
              The operating system for AI-driven teams — on your server, with your model keys.
            </p>
          </blockquote>
          <div className="flex-1" />
          <p className="font-mono text-[11.5px] text-ink2">humans ∙ personas ∙ one conversation</p>
        </div>
      </div>

      {/* Form panel. */}
      <div className="relative flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center">
          <Link href="/" className="lg:hidden" aria-label="Back to the NeuralOps Nexus home page">
            <Wordmark className="text-[17px]" />
          </Link>
          <span className="flex-1" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-[26px] font-extrabold">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[14px] text-ink2">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            <p className="mt-8 text-center text-[13px] text-ink2">
              <Link href="/" className="hover:text-ink">← Back to the home page</Link>
            </p>
          </div>
        </div>
        <footer className="pb-2 pt-4 text-center text-[12px] text-ink2">© 2026 NeuralOps, Inc. All rights reserved.</footer>
      </div>
    </div>
  );
}
