import { getSupabase } from "@/lib/supabase";

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export async function signInWithGitHub() {
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function getCurrentSession() {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export interface VerifyResult {
  ok: boolean;
  status: number;
  // populated when ok === true
  userId?: string;
  role?: string;
  companyName?: string;
  isOwner?: boolean;
  serverVersion?: string; // #170 -- self-host version check, see version.ts
}

/** Verify the Supabase JWT against a Django NeuralOps server. */
export interface ChangeUsernameResult {
  ok: boolean;
  display_name: string;
}

export async function changeUsername(
  newName: string,
  topicId: string,
): Promise<ChangeUsernameResult> {
  const { apiJson } = await import("./api-client");
  return apiJson<ChangeUsernameResult>("/api/v1/auth/change-username/", {
    method: "POST",
    body: JSON.stringify({ new_name: newName, topic_id: topicId }),
  });
}

export interface ServerConfigResult {
  serverUrl: string;
  serverVersion: string | null;
}

/**
 * Public, unauthenticated peek at a server's version -- used to preview
 * version drift on ServerList.tsx *before* the user clicks Connect. Does
 * NOT use /auth/verify/, which has real side effects (creates the user
 * record, assigns avatar/display name) that shouldn't fire just from
 * having a server saved in the list.
 */
export async function fetchServerConfig(
  serverUrl: string,
): Promise<ServerConfigResult | null> {
  try {
    const res = await fetch(`${serverUrl}/api/v1/auth/config/`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return {
      serverUrl: data.server_url ?? serverUrl,
      serverVersion: data.server_version ?? null,
    };
  } catch {
    return null;
  }
}

export async function verifyServerAccess(
  serverUrl: string,
  token: string,
): Promise<VerifyResult> {
  try {
    const res = await fetch(`${serverUrl}/api/v1/auth/verify/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        status: res.status,
        userId: data.user_id,
        role: data.role ?? null,
        companyName: data.company_name ?? null,
        isOwner: data.is_owner ?? false,
        serverVersion: data.server_version ?? undefined,
      };
    }
    return { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
