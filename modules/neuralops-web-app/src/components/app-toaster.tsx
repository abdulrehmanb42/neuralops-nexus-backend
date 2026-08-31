"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/theme/theme-provider";

// Success/error/warning toasts come colored via richColors — which only works
// when nothing overrides background/color, and when sonner knows the actual
// theme (it can't see our data-theme attribute on its own).
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      richColors
      theme={theme}
      position="top-right"
      toastOptions={{ style: { boxShadow: "0 16px 48px -20px rgba(12,10,8,.4)" } }}
    />
  );
}
