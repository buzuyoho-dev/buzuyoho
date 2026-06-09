import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서비스 롤 클라이언트 — RLS를 우회하는 관리용 클라이언트
// 절대 클라이언트 사이드에 노출하지 말 것 (서버 전용)
const globalForAdmin = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __buzuyohoAdminClient?: SupabaseClient<any>;
};

function buildAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const adminClient =
  globalForAdmin.__buzuyohoAdminClient ?? buildAdminClient();

if (process.env.NODE_ENV !== "production") {
  globalForAdmin.__buzuyohoAdminClient = adminClient;
}
