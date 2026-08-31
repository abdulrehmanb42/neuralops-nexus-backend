"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { getQueryClient } from "@/lib/auth/session-cleanup";
import { SupabaseSessionSync } from "@/lib/supabase-session";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient);
  return (
    <QueryClientProvider client={client}>
      <SupabaseSessionSync />
      {children}
    </QueryClientProvider>
  );
}
