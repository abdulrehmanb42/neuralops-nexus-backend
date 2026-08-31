"use client";

import { useEffect } from "react";
import { clearAccountScopedState } from "@/lib/auth/session-cleanup";
import { supabase } from "@/lib/supabase";
import { useConnectionStore } from "@/stores/connection.store";

// Keeps the connection store's identity in sync with the Supabase session:
// hydrates on load, follows sign-in/out and token refreshes.
export function SupabaseSessionSync() {
  useEffect(() => {
    // Design fixtures under /dev/* drive the stores themselves (dev builds only).
    if (process.env.NODE_ENV !== "production" && window.location.pathname.startsWith("/dev/")) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s?.user) useConnectionStore.getState().setIdentity(s.access_token, s.user.id, s.user.email ?? "");
      useConnectionStore.setState({ hydrated: true });
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      // A session can end WITHOUT a sign-out button: expiry, revocation, or
      // sign-out in another tab all land here — and must clear exactly what
      // the buttons clear, or the next account inherits this one's state.
      if (event === "SIGNED_OUT" || !s?.user) clearAccountScopedState();
      else useConnectionStore.getState().setIdentity(s.access_token, s.user.id, s.user.email ?? "");
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
