"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/theme-provider";

const ORDER = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme}`}
      onClick={() => setTheme(next)}
      className="flex size-10 items-center justify-center rounded-xl border border-transparent text-ink2 transition-colors hover:border-line hover:bg-surface hover:text-ink [&>svg]:size-[18px]"
    >
      <Icon strokeWidth={1.8} />
    </button>
  );
}
