import { NextResponse } from "next/server";
import { getClientIp, getIdeaUsage, getOutlierUsage } from "@/lib/usageLimiter";

export async function GET(request: Request) {
  const ip = getClientIp(request);

  return NextResponse.json({
    outlier: getOutlierUsage(ip),
    idea: getIdeaUsage(ip),
  });
}
