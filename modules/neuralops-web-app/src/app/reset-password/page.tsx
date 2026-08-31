"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setPending(true);
    const { error: err } = await supabase().auth.updateUser({ password });
    setPending(false);
    if (err) return setError(err.message);
    router.push("/servers");
  };

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pw2">Confirm password</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" variant="primary" size="lg" loading={pending}>Update password</Button>
      </form>
    </AuthShell>
  );
}
