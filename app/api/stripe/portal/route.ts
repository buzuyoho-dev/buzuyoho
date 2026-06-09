import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const { data: planData } = await supabase
    .from("user_plans")
    .select("stripe_customer_id")
    .maybeSingle();

  const customerId = (planData as { stripe_customer_id?: string } | null)?.stripe_customer_id;

  if (!customerId) {
    return NextResponse.json({ error: "決済情報が見つかりません。" }, { status: 400 });
  }

  const { origin } = new URL(request.url);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/mypage`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ポータルセッションの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
