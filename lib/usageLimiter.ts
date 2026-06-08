// 로그인 없이 IP 주소 기준으로 무료 이용 횟수를 제한한다.
// 지금은 서버 메모리(Map)에 저장하고, 추후 Supabase 등 DB로 교체할 예정이다.
// 주의: 메모리 저장이므로 서버가 재시작되면 카운트가 초기화된다.

export const OUTLIER_DAILY_LIMIT = 3;
export const IDEA_MONTHLY_LIMIT = 10;

interface UsageRecord {
  count: number;
  periodKey: string;
}

// Next.js(Turbopack) dev 모드에서는 라우트 파일마다 이 모듈이 별도로 인스턴스화될 수 있어
// 그냥 모듈 스코프 Map을 쓰면 라우트 간에 카운트가 공유되지 않는 문제가 있었다.
// globalThis에 고정해 항상 같은 Map 인스턴스를 참조하도록 한다 (Prisma client 싱글톤과 동일한 패턴).
const globalForUsage = globalThis as unknown as {
  __buzuyohoOutlierUsage?: Map<string, UsageRecord>;
  __buzuyohoIdeaUsage?: Map<string, UsageRecord>;
};

const outlierUsage = globalForUsage.__buzuyohoOutlierUsage ?? new Map<string, UsageRecord>();
const ideaUsage = globalForUsage.__buzuyohoIdeaUsage ?? new Map<string, UsageRecord>();
globalForUsage.__buzuyohoOutlierUsage = outlierUsage;
globalForUsage.__buzuyohoIdeaUsage = ideaUsage;

function dailyKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthlyKey(now: Date): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

function currentCount(store: Map<string, UsageRecord>, ip: string, periodKey: string): number {
  const record = store.get(ip);
  if (!record || record.periodKey !== periodKey) return 0;
  return record.count;
}

function increment(store: Map<string, UsageRecord>, ip: string, periodKey: string): number {
  const record = store.get(ip);
  if (!record || record.periodKey !== periodKey) {
    store.set(ip, { count: 1, periodKey });
    return 1;
  }
  record.count += 1;
  return record.count;
}

export interface UsageStatus {
  remaining: number;
  limit: number;
}

export interface UsageConsumeResult extends UsageStatus {
  allowed: boolean;
}

export function getOutlierUsage(ip: string): UsageStatus {
  const used = currentCount(outlierUsage, ip, dailyKey(new Date()));
  return { remaining: Math.max(0, OUTLIER_DAILY_LIMIT - used), limit: OUTLIER_DAILY_LIMIT };
}

export function getIdeaUsage(ip: string): UsageStatus {
  const used = currentCount(ideaUsage, ip, monthlyKey(new Date()));
  return { remaining: Math.max(0, IDEA_MONTHLY_LIMIT - used), limit: IDEA_MONTHLY_LIMIT };
}

// 한도 내에 있으면 사용 횟수를 1 증가시키고 허용한다. 한도 초과 시 카운트는 그대로 둔다.
export function consumeOutlierUsage(ip: string): UsageConsumeResult {
  const periodKey = dailyKey(new Date());
  const used = currentCount(outlierUsage, ip, periodKey);
  if (used >= OUTLIER_DAILY_LIMIT) {
    return { allowed: false, remaining: 0, limit: OUTLIER_DAILY_LIMIT };
  }
  const newUsed = increment(outlierUsage, ip, periodKey);
  return { allowed: true, remaining: Math.max(0, OUTLIER_DAILY_LIMIT - newUsed), limit: OUTLIER_DAILY_LIMIT };
}

export function consumeIdeaUsage(ip: string): UsageConsumeResult {
  const periodKey = monthlyKey(new Date());
  const used = currentCount(ideaUsage, ip, periodKey);
  if (used >= IDEA_MONTHLY_LIMIT) {
    return { allowed: false, remaining: 0, limit: IDEA_MONTHLY_LIMIT };
  }
  const newUsed = increment(ideaUsage, ip, periodKey);
  return { allowed: true, remaining: Math.max(0, IDEA_MONTHLY_LIMIT - newUsed), limit: IDEA_MONTHLY_LIMIT };
}

// 프록시/로드밸런서를 거치는 환경을 고려해 x-forwarded-for를 우선 사용한다.
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
