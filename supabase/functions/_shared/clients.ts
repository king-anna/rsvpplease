// Supabase clients + env helpers shared across Edge Functions.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function env(key: string, required = true): string {
  const v = Deno.env.get(key);
  if (required && !v) throw new Error(`Missing required env var: ${key}`);
  return v ?? "";
}

// Service-role client — bypasses RLS. Use for all privileged writes.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

// User-scoped client built from the caller's Authorization header — used only
// to resolve who is calling (auth.getUser) so we can verify event ownership.
export function userClient(authHeader: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}
