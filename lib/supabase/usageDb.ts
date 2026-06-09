import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OUTLIER_DAILY_LIMIT,
  IDEA_MONTHLY_LIMIT,
  NICHE_DAILY_LIMIT,
  type UsageStatus,
  type UsageConsumeResult,
} from "@/lib/usageLimiter";
import { adminClient } from "@/lib/supabase/admin";

export type DbFeature = "outlier" | "idea" | "niche";
export type UserPlan = "free" | "standard" | "pro";

// スタンダード 플랜의 아이디어 월 한도
const STANDARD_IDEA_MONTHLY = 100;

export function getDbPeriodKey(feature: DbFeature): string {
  const iso = new Date().toISOString();
  return feature === "idea" ? iso.slice(0, 7) : iso.slice(0, 10);
}

export function getDbLimit(feature: DbFeature): number {
  switch (feature) {
    case "outlier":
      return OUTLIER_DAILY_LIMIT;
    case "idea":
      return IDEA_MONTHLY_LIMIT;
    case "niche":
      return NICHE_DAILY_LIMIT;
  }
}

// 플랜별 한도 (9999 = 실질적 무제한)
function getPlanLimit(plan: UserPlan, feature: DbFeature): number {
  if (plan === "pro") return 9999;
  if (plan === "standard") {
    return feature === "idea" ? STANDARD_IDEA_MONTHLY : 9999;
  }
  return getDbLimit(feature);
}

// 현재 유저의 플랜 조회 (active 구독이 없으면 'free')
export async function getUserPlan(supabase: SupabaseClient): Promise<UserPlan> {
  const { data } = await supabase
    .from("user_plans")
    .select("plan, stripe_subscription_status")
    .maybeSingle();

  if (!data || data.stripe_subscription_status !== "active") return "free";
  if (data.plan === "pro") return "pro";
  if (data.plan === "standard") return "standard";
  return "free";
}

// 원자적 사용량 소비 — DB의 consume_feature_usage RPC 호출
export async function consumeDbUsage(
  supabase: SupabaseClient,
  feature: DbFeature,
  limit?: number,
): Promise<UsageConsumeResult> {
  const pKey = getDbPeriodKey(feature);
  const effectiveLimit = limit ?? getDbLimit(feature);

  const { data, error } = await supabase.rpc("consume_feature_usage", {
    p_feature: feature,
    p_period_key: pKey,
    p_limit: effectiveLimit,
  });

  if (error) throw new Error(error.message);

  return {
    allowed: (data as { allowed: boolean }).allowed,
    remaining: (data as { remaining: number }).remaining,
    limit: (data as { limit: number }).limit,
  };
}

// 플랜 인식 사용량 소비 (유료 플랜은 한도 높음 / pro는 무제한)
export async function checkPlanUsage(
  supabase: SupabaseClient,
  feature: DbFeature,
  plan: UserPlan,
): Promise<UsageConsumeResult> {
  const limit = getPlanLimit(plan, feature);

  // 무제한 플랜: DB 호출 없이 바로 허용
  if (limit >= 9999) {
    return { allowed: true, remaining: 9999, limit: 9999 };
  }

  return consumeDbUsage(supabase, feature, limit);
}

// 플랜 인식 사용량 조회 (소비 없음)
export async function getPlanUsageStatus(
  supabase: SupabaseClient,
  feature: DbFeature,
  plan: UserPlan,
): Promise<UsageStatus> {
  const limit = getPlanLimit(plan, feature);

  if (limit >= 9999) {
    return { remaining: 9999, limit: 9999 };
  }

  const pKey = getDbPeriodKey(feature);
  const { data } = await supabase
    .from("user_usage")
    .select("count")
    .eq("feature", feature)
    .eq("period_key", pKey)
    .maybeSingle();

  const used = (data as { count: number } | null)?.count ?? 0;
  return { remaining: Math.max(0, limit - used), limit };
}

// 현재 사용량 조회 (소비 없이, 기존 함수 — 플랜 미반영)
export async function getDbUsageStatus(
  supabase: SupabaseClient,
  feature: DbFeature,
): Promise<UsageStatus> {
  return getPlanUsageStatus(supabase, feature, "free");
}

// ── IP 기반 사용량 (비로그인 사용자, ip_usage 테이블 사용) ──────────────────

// IP 기반 사용량 조회 (소비 없음)
export async function getIpUsageStatus(
  feature: DbFeature,
  ip: string,
): Promise<UsageStatus> {
  const limit = getDbLimit(feature);
  const pKey = getDbPeriodKey(feature);

  const { data } = await adminClient
    .from("ip_usage")
    .select("count")
    .eq("ip", ip)
    .eq("feature", feature)
    .eq("period_key", pKey)
    .maybeSingle();

  const used = (data as { count: number } | null)?.count ?? 0;
  return { remaining: Math.max(0, limit - used), limit };
}

// IP 기반 사용량 소비 (read-then-write, MVP용 — 고동시성 환경에서는 RPC로 교체 권장)
export async function consumeIpUsage(
  feature: DbFeature,
  ip: string,
): Promise<UsageConsumeResult> {
  const limit = getDbLimit(feature);
  const pKey = getDbPeriodKey(feature);

  const { data } = await adminClient
    .from("ip_usage")
    .select("count")
    .eq("ip", ip)
    .eq("feature", feature)
    .eq("period_key", pKey)
    .maybeSingle();

  const used = (data as { count: number } | null)?.count ?? 0;

  if (used >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  await adminClient.from("ip_usage").upsert(
    { ip, feature, period_key: pKey, count: used + 1, updated_at: new Date().toISOString() },
    { onConflict: "ip,feature,period_key" },
  );

  return { allowed: true, remaining: Math.max(0, limit - (used + 1)), limit };
}
