"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface PlanData {
  plan: "free" | "standard" | "pro";
  status: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
}

interface UsageItem {
  remaining: number;
  limit: number;
}

interface UsageData {
  outlier: UsageItem;
  idea: UsageItem;
  niche: UsageItem;
}

const PLAN_LABELS: Record<string, string> = {
  free: "フリー",
  standard: "スタンダード",
  pro: "プロ",
};

const PLAN_COLORS: Record<string, string> = {
  free: "text-[#9490b0] border-[#9490b0]/30 bg-[#9490b0]/10",
  standard: "text-[#7c6dfa] border-[#7c6dfa]/30 bg-[#7c6dfa]/10",
  pro: "text-amber-400 border-amber-400/30 bg-amber-400/10",
};

const UPGRADE_PLANS = [
  {
    id: "standard" as const,
    name: "スタンダード",
    price: "¥500/月",
    priceEnv: "STRIPE_STANDARD_PRICE_ID",
    features: ["アウトライアー探索 無制限", "AIアイデア 月100件", "ニッチ探索 無制限"],
    color: "border-[#7c6dfa]/40 hover:border-[#7c6dfa]",
    btnClass: "bg-[#7c6dfa] text-[#0a0a0f] hover:bg-[#7c6dfa]/90",
  },
  {
    id: "pro" as const,
    name: "プロ",
    price: "¥1,200/月",
    priceEnv: "STRIPE_PRO_PRICE_ID",
    features: ["全機能 完全無制限", "ニッチ探索", "競合チャンネル分析"],
    color: "border-amber-400/40 hover:border-amber-400",
    btnClass: "bg-amber-400 text-[#0a0a0f] hover:bg-amber-400/90",
  },
];

export default function MyPage() {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";
  const supabase = createClient();

  useEffect(() => {
    // 비로그인 사용자는 로그인 페이지로 이동
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/auth");
        return;
      }
      // 플랜과 사용량 병렬 조회
      Promise.all([
        fetch("/api/plan").then((r) => r.json()),
        fetch("/api/usage").then((r) => r.json()),
      ]).then(([plan, usageRes]) => {
        setPlanData(plan as PlanData);
        setUsage(usageRes as UsageData);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpgrade = async (planId: "standard" | "pro") => {
    setCheckoutLoading(planId);
    setError(null);

    const priceId =
      planId === "standard"
        ? process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID;

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json();

    if (!res.ok || !data.url) {
      setError(data.error ?? "決済ページの準備に失敗しました。");
      setCheckoutLoading(null);
      return;
    }

    window.location.href = data.url;
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError(null);

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();

    if (!res.ok || !data.url) {
      setError(data.error ?? "管理ページの準備に失敗しました。");
      setPortalLoading(false);
      return;
    }

    window.location.href = data.url;
  };

  const currentPlan = planData?.plan ?? "free";
  const isActivePaid = planData?.status === "active" && currentPlan !== "free";

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* 결제 성공 메시지 */}
        {paymentSuccess && (
          <div className="mb-8 rounded-lg border border-[#7c6dfa]/30 bg-[#7c6dfa]/10 px-4 py-4 text-center">
            <p className="text-sm font-medium text-[#7c6dfa]">
              お支払いが完了しました！プランが有効になりました。
            </p>
          </div>
        )}

        <h1 className="mb-8 text-xl font-bold text-[#e8e6f0]">マイページ</h1>

        {/* 현재 플랜 */}
        <section className="mb-6 rounded-xl border border-[#7c6dfa]/15 bg-[#13131a] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#9490b0]">現在のプラン</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${PLAN_COLORS[currentPlan]}`}
            >
              {PLAN_LABELS[currentPlan]}プラン
            </span>
            {isActivePaid && planData?.currentPeriodEnd && (
              <span className="text-xs text-[#9490b0]">
                次回更新:{" "}
                {new Date(planData.currentPeriodEnd).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {/* 구독 관리 버튼 */}
          {isActivePaid && (
            <button
              type="button"
              onClick={handlePortal}
              disabled={portalLoading}
              className="mt-4 rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {portalLoading ? "読み込み中..." : "プランを解約する"}
            </button>
          )}
        </section>

        {/* 사용량 현황 */}
        {usage && (
          <section className="mb-6 rounded-xl border border-[#7c6dfa]/15 bg-[#13131a] p-6">
            <h2 className="mb-4 text-sm font-semibold text-[#9490b0]">今月の利用状況</h2>
            <div className="flex flex-col gap-3">
              <UsageRow
                label="アウトライアー探索"
                period="本日"
                item={usage.outlier}
                plan={currentPlan}
              />
              <UsageRow
                label="AIアイデア生成"
                period="今月"
                item={usage.idea}
                plan={currentPlan}
              />
              <UsageRow
                label="ニッチ探索"
                period="本日"
                item={usage.niche}
                plan={currentPlan}
              />
            </div>
          </section>
        )}

        {/* 업그레이드 플랜 */}
        {!isActivePaid && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-[#9490b0]">プランをアップグレード</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {UPGRADE_PLANS.filter((p) => p.id !== currentPlan).map((plan) => (
                <div
                  key={plan.id}
                  className={`flex flex-col gap-4 rounded-xl border bg-[#13131a] p-5 transition-colors ${plan.color}`}
                >
                  <div>
                    <p className="text-base font-bold text-[#e8e6f0]">{plan.name}</p>
                    <p className="text-xl font-semibold text-[#7c6dfa]">{plan.price}</p>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#e8e6f0]/80">
                        <span className="text-[#7c6dfa]">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={checkoutLoading !== null}
                    className={`mt-auto w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${plan.btnClass}`}
                  >
                    {checkoutLoading === plan.id ? "読み込み中..." : "アップグレード"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 프로 → 스탠다드 업그레이드 옵션 불필요, 스탠다드 → 프로만 */}
        {currentPlan === "standard" && isActivePaid && (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-[#9490b0]">プロプランへアップグレード</h2>
            <div
              className={`flex flex-col gap-4 rounded-xl border bg-[#13131a] p-5 transition-colors ${UPGRADE_PLANS[1].color}`}
            >
              <div>
                <p className="text-base font-bold text-[#e8e6f0]">{UPGRADE_PLANS[1].name}</p>
                <p className="text-xl font-semibold text-amber-400">{UPGRADE_PLANS[1].price}</p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {UPGRADE_PLANS[1].features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#e8e6f0]/80">
                    <span className="text-amber-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleUpgrade("pro")}
                disabled={checkoutLoading !== null}
                className={`mt-auto w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${UPGRADE_PLANS[1].btnClass}`}
              >
                {checkoutLoading === "pro" ? "読み込み中..." : "プロにアップグレード"}
              </button>
            </div>
          </section>
        )}

        {error && (
          <p className="mt-6 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}

function UsageRow({
  label,
  period,
  item,
  plan,
}: {
  label: string;
  period: string;
  item: UsageItem;
  plan: string;
}) {
  const isUnlimited = item.limit >= 9999;
  const used = isUnlimited ? null : item.limit - item.remaining;
  const pct = isUnlimited ? 0 : Math.round(((used ?? 0) / item.limit) * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#e8e6f0]/80">{label}</span>
        <span className="text-xs text-[#9490b0]">
          {isUnlimited ? (
            <span className="text-[#7c6dfa]">無制限</span>
          ) : (
            `${period} ${used}/${item.limit}回`
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0a0a0f]">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-400" : "bg-[#7c6dfa]"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
