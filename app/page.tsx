"use client";

import { useEffect, useState } from "react";
import type { OutlierVideo } from "./api/outliers/route";
import type { IdeaResult } from "./api/idea/route";
import type { UsageStatus } from "@/lib/usageLimiter";

interface IdeaModalState {
  video: OutlierVideo;
  loading: boolean;
  error: string | null;
  idea: IdeaResult | null;
}

interface UsageState {
  outlier: UsageStatus;
  idea: UsageStatus;
}

const OUTLIER_LIMIT_MESSAGE =
  "本日の無料利用回数を超えました。明日またご利用いただくか、有料プランをご検討ください。";
const IDEA_LIMIT_MESSAGE =
  "今月の無料アイデア生成回数の上限に達しました。来月またご利用いただくか、有料プランをご検討ください。";

export default function Home() {
  const [genre, setGenre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outliers, setOutliers] = useState<OutlierVideo[] | null>(null);
  const [ideaModal, setIdeaModal] = useState<IdeaModalState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);

  // 화면 진입 시 현재 IP 기준 남은 무료 이용 횟수를 가져온다
  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then((data) => setUsage({ outlier: data.outlier, idea: data.idea }))
      .catch(() => {});
  }, []);

  // 입력한 장르로 아웃라이어 영상을 검색해서 결과를 화면에 표시한다
  const handleForecast = async () => {
    const trimmedGenre = genre.trim();
    if (!trimmedGenre || loading || (usage && usage.outlier.remaining <= 0)) return;

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

      if (!res.ok) {
        throw new Error(data?.error ?? "予報に失敗しました。");
      }

      setOutliers(data.outliers as OutlierVideo[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予報に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 선택한 아웃라이어 영상 정보를 Claude APIに送ってアイデアを生成し、モーダルに表示する
  const handleGenerateIdea = async (video: OutlierVideo) => {
    if (usage && usage.idea.remaining <= 0) return;

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

      if (!res.ok) {
        throw new Error(data?.error ?? "アイデア生成に失敗しました。");
      }

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

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0f] px-4 py-20">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <p className="text-lg text-[#e8e6f0]">ジャンルを入力してください</p>
        {usage && (
          <p className={`text-xs ${outlierLimitReached ? "text-red-400" : "text-[#e8e6f0]/50"}`}>
            {outlierLimitReached ? OUTLIER_LIMIT_MESSAGE : `本日あと${usage.outlier.remaining}回利用できます`}
          </p>
        )}
        <input
          type="text"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleForecast();
          }}
          placeholder="例：料理、ゲーム、旅行..."
          className="w-full rounded-lg border border-[#7c6dfa]/40 bg-[#0a0a0f] px-4 py-3 text-[#e8e6f0] placeholder:text-[#e8e6f0]/40 outline-none transition-colors focus:border-[#7c6dfa]"
        />
        <p className="text-xs text-[#9490b0]">
          💡 日本語で入力するとより精度が上がります（例：料理、ゲーム、旅行）
        </p>
        <button
          type="button"
          onClick={handleForecast}
          disabled={loading || !genre.trim() || outlierLimitReached}
          className="w-full rounded-lg bg-[#7c6dfa] px-4 py-3 font-medium text-[#0a0a0f] transition-colors hover:bg-[#7c6dfa]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "予報中..." : "予報する"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {outliers && (
        <div className="mt-16 w-full max-w-6xl">
          {outliers.length === 0 ? (
            <p className="text-center text-sm text-[#e8e6f0]/60">
              アウトライアー動画が見つかりませんでした。別のジャンルで試してください。
            </p>
          ) : (
            <>
              {ideaLimitReached && (
                <p className="mb-6 text-center text-xs text-red-400">{IDEA_LIMIT_MESSAGE}</p>
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
