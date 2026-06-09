// 사용량 제한 상수, 타입, IP 추출 유틸리티
// 실제 소비/조회는 lib/supabase/usageDb.ts의 consumeIpUsage / getIpUsageStatus 사용

export const OUTLIER_DAILY_LIMIT = 3;
export const IDEA_MONTHLY_LIMIT = 10;
export const NICHE_DAILY_LIMIT = 2;

export interface UsageStatus {
  remaining: number;
  limit: number;
}

export interface UsageConsumeResult extends UsageStatus {
  allowed: boolean;
}

// 프록시/로드밸런서를 거치는 환경을 고려해 x-forwarded-for를 우선 사용한다
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
