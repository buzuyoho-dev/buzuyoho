"use client";

import { useEffect, useState } from "react";
import type { OutlierVideo } from "./api/outliers/route";
import type { IdeaResult } from "./api/idea/route";
import type { NicheRecommendation } from "./api/niche/route";
import type { UsageStatus } from "@/lib/usageLimiter";

type ActiveTab = "outlier" | "niche";

interface IdeaModalState {
  video: OutlierVideo;
  loading: boolean;
  error: string | null;
  idea: IdeaResult | null;
}

interface UsageState {
  outlier: UsageStatus;
  idea: UsageStatus;
  niche: UsageStatus;
}

export default function Home() {
  const [genre, setGenre] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("outlier");

  // アウトライアー探索 state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outliers, setOutliers] = useState<OutlierVideo[] | null>(null);

  // ニッチ探索 state
  const [nicheLoading, setNicheLoading] = useState(false);
  const [nicheError, setNicheError] = useState<string | null>(null);
  const [niches, setNiches] = useState<NicheRecommendation[] | null>(null);

  // アイデア生成モーダル state
  const [ideaModal, setIdeaModal] = useState<IdeaModalState | null>(null);

  // 사용량 state
  const [usage, setUsage] = useState<UsageState | null>(null);

  // 화면 진입 시 IP 기준 남은 무료 이용 횟수를 가져온다
  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then((data) => setUsage({ outlier: data.outlier, idea: data.idea, niche: data.niche }))
      .catch(() => {});
  }, []);

  // 아웃라이어 탐색 실행
  const handleForecast = async () => {
    const trimmedGenre = genre.trim();
    if (!trimmedGenre || loading || outlierLimitReached) return;

    setLoading(true);
    setError(null);
    setOutliers(null);

    try {
      const res = await fetch("/api/outliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre: trimmedGenre }),
      });
      const data = await res.json();

      if (data?.usage) {
        setUsage((prev) => (prev ? { ...prev, outlier: data.usage as UsageStatus } : prev));
      }

      if (!res.ok) throw new Error(data?.error ?? "予報に失敗しました。");
      setOutliers(data.outliers as OutlierVideo[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予報に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 니치 탐색 실행
  const handleNicheSearch = async () => {
    const trimmedGenre = genre.trim();
    if (!trimmedGenre || nicheLoading || nicheLimitReached) return;

    setNicheLoading(true);
    setNicheError(null);
    setNiches(null);

    try {
      const res = await fetch("/api/niche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre: trimmedGenre }),
      });
      const data = await res.json();

      if (data?.usage) {
        setUsage((prev) => (prev ? { ...prev, niche: data.usage as UsageStatus } : prev));
      }

      if (!res.ok) throw new Error(data?.error ?? "ニッチ探索に失敗しました。");
      setNiches(data.recommendations as NicheRecommendation[]);
    } catch (err) {
      setNicheError(err instanceof Error ? err.message : "ニッチ探索に失敗しました。");
    } finally {
      setNicheLoading(false);
    }
  };

  // 아이디어 생성 모달 열기
  const handleGenerateIdea = async (video: OutlierVideo) => {
    if (ideaLimitReached) return;

    setIdeaModal({ video, loading: true, error: null, idea: null });

    try {
      const res = await fetch("/api/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: video.title,
          channelTitle: video.channelTitle,
          viewCount: video.viewCount,
          multiplierPercent: video.multiplierPercent,
        }),
      });
      const data = await res.json();

      if (data?.usage) {
        setUsage((prev) => (prev ? { ...prev, idea: data.usage as UsageStatus } : prev));
      }

      if (!res.ok) throw new Error(data?.error ?? "アイデア生成に失敗しました。");
      setIdeaModal({ video, loading: false, error: null, idea: data.idea as IdeaResult });
    } catch (err) {
      setIdeaModal({
        video,
        loading: false,
        error: err instanceof Error ? err.message : "アイデア生成に失敗しました。",
        idea: null,
      });
    }
  };

  const outlierLimitReached = Boolean(usage && usage.outlier.remaining <= 0);
  const ideaLimitReached = Boolean(usage && usage.idea.remaining <= 0);
  const nicheLimitReached = Boolean(usage && usage.niche.remaining <= 0);

  // 현재 탭 기준 상태값 계산
  const isCurrentlyLoading = activeTab === "outlier" ? loading : nicheLoading;
  const currentLimitReached = activeTab === "outlier" ? outlierLimitReached : nicheLimitReached;
  const usageRemaining = usage
    ? activeTab === "outlier"
      ? usage.outlier.remaining
      : usage.niche.remaining
    : null;
  const limitMessage =
    activeTab === "outlier"
      ? "本日の無料利用回数を超えました。明日またご利用いただくか、有料プランをご検討ください。"
      : "本日のニッチ探索の利用回数を超えました。明日またご利用いただくか、有料プランをご検討ください。";

  const handleSubmit = activeTab === "outlier" ? handleForecast : handleNicheSearch;
  const buttonLabel =
    activeTab === "outlier"
      ? loading
        ? "予報中..."
        : "予報する"
      : nicheLoading
        ? "分析中..."
        : "ニッチを探す";

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-4 py-20">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        {/* 탭 전환 버튼 */}
        <div className="flex w-full gap-1 rounded-lg bg-[#13131a] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("outlier")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "outlier"
                ? "bg-[#7c6dfa] text-[#0a0a0f]"
                : "text-[#e8e6f0]/60 hover:text-[#e8e6f0]"
            }`}
          >
            アウトライアー探索
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("niche")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "niche"
                ? "bg-[#7c6dfa] text-[#0a0a0f]"
                : "text-[#e8e6f0]/60 hover:text-[#e8e6f0]"
            }`}
          >
            ニッチ探索
          </button>
        </div>

        <p className="text-lg text-[#e8e6f0]">ジャンルを入力してください</p>

        {usage && (
          <p className={`text-xs ${currentLimitReached ? "text-red-400" : "text-[#e8e6f0]/50"}`}>
            {currentLimitReached
              ? limitMessage
              : `本日あと${usageRemaining}回利用できます`}
          </p>
        )}

        <input
          type="text"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="例：料理、ゲーム、旅行..."
          className="w-full rounded-lg border border-[#7c6dfa]/40 bg-[#0a0a0f] px-4 py-3 text-[#e8e6f0] placeholder:text-[#e8e6f0]/40 outline-none transition-colors focus:border-[#7c6dfa]"
        />
        <p className="text-xs text-[#9490b0]">
          💡 日本語で入力するとより精度が上がります（例：料理、ゲーム、旅行）
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isCurrentlyLoading || !genre.trim() || currentLimitReached}
          className="w-full rounded-lg bg-[#7c6dfa] px-4 py-3 font-medium text-[#0a0a0f] transition-colors hover:bg-[#7c6dfa]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>

        {activeTab === "outlier" && error && <p className="text-sm text-red-400">{error}</p>}
        {activeTab === "niche" && nicheError && (
          <p className="text-sm text-red-400">{nicheError}</p>
        )}
      </div>

      {/* アウトライアー探索 결과 */}
      {activeTab === "outlier" && outliers && (
        <div className="mt-16 w-full max-w-6xl">
          {outliers.length === 0 ? (
            <p className="text-center text-sm text-[#e8e6f0]/60">
              アウトライアー動画が見つかりませんでした。別のジャンルで試してください。
            </p>
          ) : (
            <>
              {ideaLimitReached && (
                <p className="mb-6 text-center text-xs text-red-400">
                  今月の無料アイデア生成回数の上限に達しました。来月またご利用いただくか、有料プランをご検討ください。
                </p>
              )}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {outliers.map((video) => (
                  <OutlierCard
                    key={video.videoId}
                    video={video}
                    onGenerateIdea={handleGenerateIdea}
                    ideaDisabled={ideaLimitReached}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ニッチ探索 결과 */}
      {activeTab === "niche" && niches && (
        <div className="mt-16 w-full max-w-3xl">
          {niches.length === 0 ? (
            <p className="text-center text-sm text-[#e8e6f0]/60">
              ニッチジャンルが見つかりませんでした。別のジャンルで試してください。
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {niches.map((niche, i) => (
                <NicheCard key={i} niche={niche} />
              ))}
            </div>
          )}
        </div>
      )}

      {ideaModal && (
        <IdeaModal
          video={ideaModal.video}
          loading={ideaModal.loading}
          error={ideaModal.error}
          idea={ideaModal.idea}
          onClose={() => setIdeaModal(null)}
        />
      )}
    </div>
  );
}

function OutlierCard({
  video,
  onGenerateIdea,
  ideaDisabled,
}: {
  video: OutlierVideo;
  onGenerateIdea: (video: OutlierVideo) => void;
  ideaDisabled: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[#7c6dfa]/20 bg-[#13131a]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={video.thumbnailUrl} alt={video.title} className="aspect-video w-full object-cover" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="w-fit rounded-full bg-[#7c6dfa]/15 px-3 py-1 text-xs font-medium text-[#7c6dfa]">
          平均比 +{video.multiplierPercent.toLocaleString()}%
        </span>
        <h3 className="line-clamp-2 text-sm font-medium text-[#e8e6f0]">{video.title}</h3>
        <p className="text-xs text-[#e8e6f0]/60">{video.channelTitle}</p>
        <p className="text-xs text-[#e8e6f0]/60">再生回数 {video.viewCount.toLocaleString()}回</p>
        <button
          type="button"
          onClick={() => onGenerateIdea(video)}
          disabled={ideaDisabled}
          className="mt-auto w-full rounded-md border border-[#7c6dfa] px-3 py-2 text-sm font-medium text-[#7c6dfa] transition-colors hover:bg-[#7c6dfa]/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          このネタでアイデアを生成
        </button>
      </div>
    </div>
  );
}

function NicheCard({ niche }: { niche: NicheRecommendation }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#7c6dfa]/20 bg-[#13131a] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-[#e8e6f0]">{niche.subNiche}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            niche.difficulty === "low"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-yellow-500/15 text-yellow-400"
          }`}
        >
          {niche.difficulty === "low" ? "競合低め" : "競合普通"}
        </span>
        <span className="text-xs text-[#9490b0]">期待再生数: {niche.potentialViewCount}</span>
      </div>
      <p className="text-sm leading-relaxed text-[#e8e6f0]/80">{niche.description}</p>
      <div>
        <p className="mb-2 text-xs font-medium text-[#7c6dfa]">コンテンツアイデア</p>
        <ul className="flex flex-col gap-1.5">
          {niche.contentIdeas.map((idea, i) => (
            <li key={i} className="rounded-md bg-[#0a0a0f] px-3 py-2 text-sm text-[#e8e6f0]/80">
              {idea}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function IdeaModal({
  video,
  loading,
  error,
  idea,
  onClose,
}: {
  video: OutlierVideo;
  loading: boolean;
  error: string | null;
  idea: IdeaResult | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#7c6dfa]/30 bg-[#13131a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#7c6dfa]/15 p-6">
          <div className="min-w-0">
            <p className="text-xs text-[#e8e6f0]/50">アイデア生成</p>
            <h2 className="truncate text-base font-medium text-[#e8e6f0]">{video.title}</h2>
            <p className="mt-1 text-xs text-[#e8e6f0]/60">{video.channelTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[#7c6dfa]/30 px-3 py-1.5 text-sm text-[#e8e6f0]/70 transition-colors hover:bg-[#7c6dfa]/10"
          >
            閉じる
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {loading && (
            <p className="py-16 text-center text-sm text-[#e8e6f0]/70">AIが分析中です...</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {idea && (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#7c6dfa]">なぜバズったのか</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e8e6f0]/90">
                  {idea.viralAnalysis}
                </p>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#7c6dfa]">タイトル案</h3>
                <ul className="flex flex-col gap-1.5">
                  {idea.titleIdeas.map((titleIdea, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-[#0a0a0f] px-3 py-2 text-sm text-[#e8e6f0]/90"
                    >
                      {titleIdea}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#7c6dfa]">サムネイルコンセプト</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e8e6f0]/90">
                  {idea.thumbnailConcept}
                </p>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-[#7c6dfa]">冒頭30秒フック台本</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e8e6f0]/90">
                  {idea.hookScript}
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
