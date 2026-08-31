"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileDialog } from "@/components/shell/profile-dialog";
import { ConfirmDialog } from "@/components/ui/dialog";
import { absolutizeMedia } from "@/lib/api/client";
import { useMembers } from "@/hooks/use-workspace";
import { clearAccountScopedState } from "@/lib/auth/session-cleanup";
import { supabase } from "@/lib/supabase";
import { useConnectionStore } from "@/stores/connection.store";

// The avatar button + profile dialog + sign-out confirmation, shared by the
// server rail and the workspace top bar so both stay in lock-step.
export function ProfileButton({ size = 9 }: { size?: 8 | 9 }) {
  const router = useRouter();
  const { email, connection } = useConnectionStore();
  const { data: members } = useMembers();
  const avatar = absolutizeMedia(members?.find((m) => m.user_id === connection?.nucleusUserId)?.avatar ?? null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const signOut = async () => {
    clearAccountScopedState(); // one shared cleanup — stores, drafts, query cache, realtime
    try {
      await supabase().auth.signOut();
    } catch {
      /* local state is cleared regardless — the session dies on this device */
    }
    router.replace("/login");
  };

  return (
    <>
      <button
        aria-label="Profile and account"
        title={`Profile (${email ?? ""})`}
        onClick={() => setProfileOpen(true)}
        className={`flex ${size === 8 ? "size-8 text-[12px]" : "size-9 text-[13px]"} items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-accent-ink ring-1 ring-line transition-shadow hover:ring-accent`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- runtime server-relative media, domain unknown at build
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          (email ?? "?")[0]?.toUpperCase()
        )}
      </button>
      <ProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSignOut={() => {
          setProfileOpen(false);
          setConfirmingSignOut(true);
        }}
      />
      <ConfirmDialog
        open={confirmingSignOut}
        onClose={() => setConfirmingSignOut(false)}
        onConfirm={() => {
          setConfirmingSignOut(false);
          void signOut();
        }}
        title="Sign out?"
        body={<p>You&apos;ll be signed out of <b className="text-ink">{email}</b> on this device. Your saved servers stay with your account — they&apos;ll be back when you sign in again.</p>}
        confirmLabel="Sign out"
        tone="neutral"
      />
    </>
  );
}
