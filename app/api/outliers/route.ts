import { NextResponse } from "next/server";
import { consumeOutlierUsage, getClientIp, type UsageStatus } from "@/lib/usageLimiter";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, checkPlanUsage } from "@/lib/supabase/usageDb";

export interface OutlierVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  viewCount: number;
  channelAverageViews: number;
  multiplierPercent: number;
}

interface YoutubeSearchItem {
  id?: { videoId?: string };
}

interface YoutubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    viewCount?: string;
  };
}

interface YoutubeChannelItem {
  id: string;
  statistics?: {
    viewCount?: string;
    videoCount?: string;
  };
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
// 채널 평균 조회수 대비 이 배수 이상이면 아웃라이어로 판단한다
const OUTLIER_THRESHOLD = 10;
const SEARCH_MAX_RESULTS = 25;
const PUBLISHED_WITHIN_DAYS = 90;

export async function POST(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube APIキーが設定されていません。.env.localにYOUTUBE_API_KEYを追加してください。" },
      { status: 500 },
    );
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
    usage = await checkPlanUsage(supabase, "outlier", plan);
  } else {
    const ip = getClientIp(request);
    usage = consumeOutlierUsage(ip);
  }

  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: "本日の無料利用回数を超えました。明日またご利用いただくか、有料プランをご検討ください。",
        limitExceeded: true,
        usage: { remaining: usage.remaining, limit: usage.limit } satisfies UsageStatus,
      },
      { status: 429 },
    );
  }

  try {
    // 1. 장르 키워드로 최근 90일 내 일본 영상 검색
    // 검색어가 일본어가 아니면 일본어 번역어를 함께 붙여서 검색 정확도를 높인다 (예: "game" → "ゲーム game")
    let searchQuery = genre;
    if (!containsJapanese(genre)) {
      const translated = await translateToJapanese(genre);
      if (translated && containsJapanese(translated)) {
        searchQuery = `${translated} ${genre}`;
      }
    }

    const publishedAfter = new Date(
      Date.now() - PUBLISHED_WITHIN_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", searchQuery);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("regionCode", "JP");
    searchUrl.searchParams.set("relevanceLanguage", "ja");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("publishedAfter", publishedAfter);
    searchUrl.searchParams.set("maxResults", String(SEARCH_MAX_RESULTS));
    searchUrl.searchParams.set("key", apiKey);

    const searchData = await fetchYoutube<{ items?: YoutubeSearchItem[] }>(
      searchUrl,
      "動画の検索に失敗しました。",
    );
    const videoIds = (searchData.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return NextResponse.json({ outliers: [], usage: { remaining: usage.remaining, limit: usage.limit } });
    }

    // 2. 검색된 영상들의 상세 통계(조회수) 조회
    const videosUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
    videosUrl.searchParams.set("part", "snippet,statistics");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", apiKey);

    const videosData = await fetchYoutube<{ items?: YoutubeVideoItem[] }>(
      videosUrl,
      "動画情報の取得に失敗しました。",
    );
    const videos = videosData.items ?? [];

    // 3. 채널별 평균 조회수 계산을 위해 채널 통계 조회
    // (채널 누적 조회수 ÷ 업로드 영상 수 = 영상당 평균 조회수로 근사한다)
    const channelIds = Array.from(
      new Set(videos.map((video) => video.snippet?.channelId).filter((id): id is string => Boolean(id))),
    );
    const channelsUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    channelsUrl.searchParams.set("part", "statistics");
    channelsUrl.searchParams.set("id", channelIds.join(","));
    channelsUrl.searchParams.set("key", apiKey);

    const channelsData = await fetchYoutube<{ items?: YoutubeChannelItem[] }>(
      channelsUrl,
      "チャンネル情報の取得に失敗しました。",
    );

    const channelAverageViews = new Map<string, number>();
    for (const channel of channelsData.items ?? []) {
      const totalViews = Number(channel.statistics?.viewCount ?? 0);
      const videoCount = Number(channel.statistics?.videoCount ?? 0);
      if (videoCount > 0) {
        channelAverageViews.set(channel.id, totalViews / videoCount);
      }
    }

    // 4. 채널 평균 대비 OUTLIER_THRESHOLD배 이상 조회된 영상만 추려낸다
    const outliers: OutlierVideo[] = [];
    for (const video of videos) {
      const channelId = video.snippet?.channelId;
      const averageViews = channelId ? channelAverageViews.get(channelId) : undefined;
      const viewCount = Number(video.statistics?.viewCount ?? 0);

      if (!averageViews || averageViews <= 0) continue;
      if (viewCount < averageViews * OUTLIER_THRESHOLD) continue;

      outliers.push({
        videoId: video.id,
        title: video.snippet?.title ?? "",
        channelTitle: video.snippet?.channelTitle ?? "",
        thumbnailUrl:
          video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url ?? "",
        viewCount,
        channelAverageViews: Math.round(averageViews),
        multiplierPercent: Math.round((viewCount / averageViews) * 100 - 100),
      });
    }

    // 일본어(히라가나/가타카나/한자) 제목을 우선 정렬하되, 부족하면 JP 지역의 다른 영상도 그대로 포함한다
    outliers.sort((a, b) => {
      const aJapanese = containsJapanese(a.title) ? 0 : 1;
      const bJapanese = containsJapanese(b.title) ? 0 : 1;
      if (aJapanese !== bJapanese) return aJapanese - bJapanese;
      return b.multiplierPercent - a.multiplierPercent;
    });

    return NextResponse.json({ outliers, usage: { remaining: usage.remaining, limit: usage.limit } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "予報に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchYoutube<T>(url: URL, errorMessage: string): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`${errorMessage} (status ${res.status})`);
  }
  return res.json() as Promise<T>;
}

// 텍스트에 히라가나/가타카나/한자가 포함되어 있는지 확인한다
function containsJapanese(text: string): boolean {
  return /[぀-ゟ゠-ヿ一-鿿]/.test(text);
}

// 영어 등 일본어가 아닌 검색어를 Claude API로 짧게 일본어 키워드로 번역한다 (실패 시 null 반환)
async function translateToJapanese(text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `次の単語を日本語のキーワード1つだけに翻訳してください。説明や記号、引用符は付けず、翻訳結果の単語だけを返してください。\n\n単語: ${text}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const translated: string = (data?.content?.[0]?.text ?? "").trim();
    return translated || null;
  } catch {
    return null;
  }
}
