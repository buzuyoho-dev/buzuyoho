import { NextResponse } from "next/server";
import { getClientIp, OUTLIER_DAILY_LIMIT, NICHE_DAILY_LIMIT } from "@/lib/usageLimiter";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, getPlanUsageStatus, getIpUsageStatus } from "@/lib/supabase/usageDb";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 로그인 사용자는 DB(플랜 반영)에서, 비로그인은 메모리에서 사용량을 읽는다
  if (user) {
    const plan = await getUserPlan(supabase);
    const [outlier, idea, niche] = await Promise.all([
      getPlanUsageStatus(supabase, "outlier", plan),
      getPlanUsageStatus(supabase, "idea", plan),
      getPlanUsageStatus(supabase, "niche", plan),
    ]);
    return NextResponse.json({ outlier, idea, niche, plan });
  }

  const ip = getClientIp(request);
  const idea = await getIpUsageStatus("idea", ip);
  return NextResponse.json({
    outlier: { remaining: OUTLIER_DAILY_LIMIT, limit: OUTLIER_DAILY_LIMIT },
    idea,
    niche: { remaining: NICHE_DAILY_LIMIT, limit: NICHE_DAILY_LIMIT },
  });
}
