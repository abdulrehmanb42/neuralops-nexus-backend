"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConnectionStore } from "@/stores/connection.store";

// The landing page is for signed-out visitors only: anyone with a session is
// routed straight into the app (workspace if connected, else the launcher).
export function SignedInRedirect() {
  const router = useRouter();
  const { token, serverUrl, hydrated } = useConnectionStore();
  useEffect(() => {
    if (hydrated && token) router.replace(serverUrl ? "/w" : "/servers");
  }, [hydrated, token, serverUrl, router]);
  return null;
}
