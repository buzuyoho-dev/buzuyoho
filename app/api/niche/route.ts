import { NextResponse } from "next/server";
import { consumeNicheUsage, getClientIp, type UsageStatus } from "@/lib/usageLimiter";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, checkPlanUsage } from "@/lib/supabase/usageDb";

export interface NicheRecommendation {
  subNiche: string;
  description: string;
  difficulty: "low" | "medium";
  potentialViewCount: string;
  contentIdeas: string[];
}

interface YoutubeSearchItem {
  id?: { videoId?: string };
}

interface YoutubeVideoItem {
  id: string;
  snippet?: { title?: string; channelId?: string; channelTitle?: string };
  statistics?: { viewCount?: string };
}

interface YoutubeChannelItem {
  id: string;
  statistics?: { subscriberCount?: string };
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function POST(request: Request) {
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!youtubeKey) {
    return NextResponse.json({ error: "YouTube APIキーが設定されていません。" }, { status: 500 });
  }
  if (!anthropicKey) {
    return NextResponse.json({ error: "Claude APIキーが設定されていません。" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const genre = typeof body?.genre === "string" ? body.genre.trim() : "";
  if (!genre) {
    return NextResponse.json({ error: "ジャンルを入力してください。" }, { status: 400 });
  }

  // 로그인 사용자는 DB, 비로그인 사용자는 메모리(IP 기준)로 사용량을 추적한다
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let usage: UsageStatus & { allowed: boolean };
  if (user) {
    const plan = await getUserPlan(supabase);
    usage = await checkPlanUsage(supabase, "niche", plan);
  } else {
    const ip = getClientIp(request);
    usage = consumeNicheUsage(ip);
  }

  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: "本日のニッチ探索の利用回数を超えました。明日またご利用いただくか、有料プランをご検討ください。",
        limitExceeded: true,
        usage: { remaining: usage.remaining, limit: usage.limit } satisfies UsageStatus,
      },
      { status: 429 },
    );
  }

  try {
    // 1. 장르로 일본 유튜브 영상 50개 검색
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", genre);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("regionCode", "JP");
    searchUrl.searchParams.set("relevanceLanguage", "ja");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("maxResults", "50");
    searchUrl.searchParams.set("key", youtubeKey);

    const searchData = await fetchJson<{ items?: YoutubeSearchItem[] }>(searchUrl.toString());
    const videoIds = (searchData.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return NextResponse.json({ recommendations: [], usage: { remaining: usage.remaining, limit: usage.limit } });
    }

    // 2. 영상별 조회수 조회
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set("part", "snippet,statistics");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", youtubeKey);

    const videosData = await fetchJson<{ items?: YoutubeVideoItem[] }>(videosUrl.toString());
    const videos = videosData.items ?? [];

    // 3. 채널별 구독자 수 조회
    const channelIds = Array.from(
      new Set(videos.map((v) => v.snippet?.channelId).filter((id): id is string => Boolean(id))),
    );
    const channelsUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    channelsUrl.searchParams.set("part", "statistics");
    channelsUrl.searchParams.set("id", channelIds.join(","));
    channelsUrl.searchParams.set("key", youtubeKey);

    const channelsData = await fetchJson<{ items?: YoutubeChannelItem[] }>(channelsUrl.toString());
    const subscriberMap = new Map<string, number>();
    for (const ch of channelsData.items ?? []) {
      subscriberMap.set(ch.id, Number(ch.statistics?.subscriberCount ?? 0));
    }

    // 4. 소형 채널(구독자 10만 미만)에서 조회수 높은 영상 추출 → 기회 지표
    // 데이터가 부족하면 threshold를 50만으로 완화해 더 많은 샘플 확보
    const buildOpportunityList = (subscriberCap: number, viewFloor: number) =>
      videos
        .filter((v) => {
          const subs = subscriberMap.get(v.snippet?.channelId ?? "") ?? 0;
          const views = Number(v.statistics?.viewCount ?? 0);
          return subs > 0 && subs < subscriberCap && views >= viewFloor;
        })
        .map((v) => {
          const subs = subscriberMap.get(v.snippet?.channelId ?? "") ?? 1;
          const views = Number(v.statistics?.viewCount ?? 0);
          return {
            title: v.snippet?.title ?? "",
            channelTitle: v.snippet?.channelTitle ?? "",
            viewCount: views,
            subscriberCount: subs,
            score: views / subs,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

    let opportunityVideos = buildOpportunityList(100_000, 10_000);
    if (opportunityVideos.length < 3) {
      opportunityVideos = buildOpportunityList(500_000, 5_000);
    }

    // 5. Claude API로 서브니치 3개 추천 받기
    const videoLines =
      opportunityVideos.length > 0
        ? opportunityVideos
            .map(
              (v) =>
                `・「${v.title}」（${v.channelTitle}、登録者${v.subscriberCount.toLocaleString()}人、再生${v.viewCount.toLocaleString()}回）`,
            )
            .join("\n")
        : videos
            .slice(0, 10)
            .map((v) => `・「${v.snippet?.title ?? ""}」（${v.snippet?.channelTitle ?? ""}）`)
            .join("\n");

    const dataContext =
      opportunityVideos.length > 0
        ? "登録者数が少ないにもかかわらず再生回数が多い動画（競合が低い穴場ニッチの指標）"
        : "このジャンルの人気動画";

    const prompt = `あなたは日本のYouTubeマーケットのエキスパートです。

以下は「${genre}」ジャンルの${dataContext}のデータです：

${videoLines}

このデータを分析して、「${genre}」ジャンルで今後伸びる可能性が高い穴場サブジャンルを3つ推薦してください。

以下のJSON配列のみを返してください（説明や前後の文章は不要です）：
[
  {
    "subNiche": "サブジャンル名（日本語）",
    "description": "なぜこのサブジャンルが穴場なのか（2〜3文、日本語）",
    "difficulty": "low または medium",
    "potentialViewCount": "期待できる再生数の目安（例：5,000〜50,000回）",
    "contentIdeas": ["アイデア1", "アイデア2", "アイデア3"]
  }
]`;

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      throw new Error(`Claude APIへのリクエストに失敗しました (status ${anthropicRes.status})`);
    }

    const anthropicData = await anthropicRes.json();
    const responseText: string = anthropicData?.content?.[0]?.text ?? "";

    return NextResponse.json({
      recommendations: parseRecommendations(responseText),
      usage: { remaining: usage.remaining, limit: usage.limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ニッチ探索に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`APIリクエストに失敗しました (status ${res.status})`);
  return res.json() as Promise<T>;
}

function parseRecommendations(text: string): NicheRecommendation[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AIの応答を解析できませんでした。");

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item: Record<string, unknown>) => ({
    subNiche: String(item.subNiche ?? ""),
    description: String(item.description ?? ""),
    difficulty: item.difficulty === "medium" ? "medium" : "low",
    potentialViewCount: String(item.potentialViewCount ?? ""),
    contentIdeas: Array.isArray(item.contentIdeas) ? item.contentIdeas.map(String) : [],
  }));
}
