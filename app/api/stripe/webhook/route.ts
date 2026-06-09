import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { stripe, PLAN_BY_PRICE_ID } from "@/lib/stripe";
import type Stripe from "stripe";

// Stripe 웹훅은 서비스 롤 키로 RLS를 우회해 user_plans를 업데이트한다
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  // arrayBuffer → Buffer: 문자열 변환 없이 정확한 바이트를 Stripe에 넘겨야 서명 검증이 통과된다
  const rawBody = await request.arrayBuffer();
  const body = Buffer.from(rawBody);
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "署名がありません。" }, { status: 400 });
  }

  // 진단 로그: 직접 HMAC 계산으로 불일치 원인 확인
  const secretPrefix = process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 14) ?? "(없음)";
  console.log("[Webhook] secret prefix:", secretPrefix);
  console.log("[Webhook] body bytes:", body.length);
  console.log("[Webhook] sig header:", signature.slice(0, 60));

  // 수동 HMAC 검증
  const sigParts = Object.fromEntries(
    signature.split(",").map((p) => p.split("=", 2) as [string, string])
  );
  const timestamp = sigParts["t"];
  const incomingV1 = sigParts["v1"];
  if (timestamp && incomingV1) {
    const signedPayload = `${timestamp}.${body.toString("utf8")}`;
    const computedSig = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
      .update(signedPayload, "utf8")
      .digest("hex");
    console.log("[Webhook] computed:", computedSig.slice(0, 20));
    console.log("[Webhook] expected:", incomingV1.slice(0, 20));
    console.log("[Webhook] match:", computedSig === incomingV1);
    console.log("[Webhook] body preview:", body.toString("utf8").slice(0, 120));
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "署名の検証に失敗しました。";
    console.error("[Webhook] signature error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "処理中にエラーが発生しました。" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId || !session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string,
  );
  const priceId = subscription.items.data[0]?.price.id;
  const plan = PLAN_BY_PRICE_ID[priceId] ?? "standard";

  await supabaseAdmin.from("user_plans").upsert(
    {
      user_id: userId,
      plan,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: subscription.status,
      current_period_end: new Date(
        (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  // customer IDで user_id を引く
  const { data } = await supabaseAdmin
    .from("user_plans")
    .select("user_id")
    .eq("stripe_customer_id", subscription.customer as string)
    .maybeSingle();

  if (!data?.user_id) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = PLAN_BY_PRICE_ID[priceId] ?? "standard";

  await supabaseAdmin.from("user_plans").update({
    plan,
    stripe_subscription_status: subscription.status,
    current_period_end: new Date(
      (subscription.items.data[0]?.current_period_end ?? 0) * 1000,
    ).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", data.user_id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { data } = await supabaseAdmin
    .from("user_plans")
    .select("user_id")
    .eq("stripe_customer_id", subscription.customer as string)
    .maybeSingle();

  if (!data?.user_id) return;

  await supabaseAdmin.from("user_plans").update({
    plan: "free",
    stripe_subscription_status: "canceled",
    current_period_end: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", data.user_id);
}
