import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ plan: "free", status: null, currentPeriodEnd: null }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_plans")
    .select("plan, stripe_subscription_status, current_period_end, stripe_customer_id")
    .maybeSingle();

  return NextResponse.json({
    plan: (data?.plan as string) ?? "free",
    status: (data?.stripe_subscription_status as string) ?? null,
    currentPeriodEnd: (data?.current_period_end as string) ?? null,
    hasCustomer: !!(data as { stripe_customer_id?: string } | null)?.stripe_customer_id,
  });
}
