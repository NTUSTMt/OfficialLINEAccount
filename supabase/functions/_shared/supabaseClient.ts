import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export async function getAppConfig(key: string): Promise<string | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("app_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`getAppConfig error for key '${key}':`, error.message);
    return null;
  }

  return data ? data.value : null;
}

export async function setAppConfig(key: string, value: string): Promise<boolean> {
  const client = getSupabaseAdminClient();
  const { error } = await client
    .from("app_config")
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) {
    console.error(`setAppConfig error for key '${key}':`, error.message);
    return false;
  }

  return true;
}

export async function recordWorkerFailure(
  action: string,
  payload: Record<string, unknown>,
  errorMessage: string
): Promise<void> {
  try {
    const client = getSupabaseAdminClient();
    await client.from("worker_failures").insert({
      action,
      payload,
      error_message: errorMessage,
      status: "pending",
      retry_count: 0,
    });
  } catch (err) {
    console.error("Failed to record worker failure in database:", err);
  }
}
