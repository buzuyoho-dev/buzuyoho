import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const priceId = typeof body?.priceId === "string" ? body.priceId : "";
  if (!priceId) {
    return NextResponse.json({ error: "料金プランを指定してください。" }, { status: 400 });
  }

  const { origin } = new URL(request.url);

  try {
    // 기존 Stripe 고객 ID 조회
    const { data: planData } = await supabase
      .from("user_plans")
      .select("stripe_customer_id")
      .maybeSingle();

    let customerId = (planData as { stripe_customer_id?: string } | null)?.stripe_customer_id;

    // 고객 ID가 없으면 새로 생성
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    // Stripe Checkout 세션 생성
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/mypage?payment=success`,
      cancel_url: `${origin}/mypage`,
      metadata: { user_id: user.id },
      locale: "ja",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "決済セッションの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
