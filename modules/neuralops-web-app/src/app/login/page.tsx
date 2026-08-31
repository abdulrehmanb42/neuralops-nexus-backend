"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { useConnectionStore } from "@/stores/connection.store";

export default function LoginPage() {
  const router = useRouter();
  const { token, serverUrl, hydrated } = useConnectionStore();

  useEffect(() => {
    if (!hydrated) return;
    if (token && serverUrl) router.replace("/w");
    else if (token) router.replace("/servers");
  }, [hydrated, token, serverUrl, router]);

  return (
    <AuthShell title="Sign in" subtitle="One account for every NeuralOps server you join.">
      <LoginForm />
    </AuthShell>
  );
}
