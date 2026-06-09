import Stripe from "stripe";

// 서버 사이드 전용 Stripe 인스턴스 (절대 클라이언트에 노출하지 않는다)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

// Stripe 가격 ID → 플랜명 매핑 (NEXT_PUBLIC_ 변수는 클라이언트에서도 읽힌다)
export const PLAN_BY_PRICE_ID: Record<string, "standard" | "pro"> = {
  [process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID!]: "standard",
  [process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID!]: "pro",
};
