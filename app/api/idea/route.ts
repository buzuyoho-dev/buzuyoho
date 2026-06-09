import { NextResponse } from "next/server";
import { consumeIdeaUsage, getClientIp, type UsageStatus } from "@/lib/usageLimiter";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, checkPlanUsage } from "@/lib/supabase/usageDb";

export interface IdeaResult {
  viralAnalysis: string;
  titleIdeas: string[];
  thumbnailConcept: string;
  hookScript: string;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Claude APIキーが設定されていません。.env.localにANTHROPIC_API_KEYを追加してください。" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : "";
  const channelTitle = typeof body?.channelTitle === "string" ? body.channelTitle : "";
  const viewCount = typeof body?.viewCount === "number" ? body.viewCount : undefined;
  const multiplierPercent = typeof body?.multiplierPercent === "number" ? body.multiplierPercent : undefined;

  if (!title || !channelTitle) {
    return NextResponse.json({ error: "動画情報が正しくありません。" }, { status: 400 });
  }

  // 로그인 사용자는 DB, 비로그인 사용자는 메모리(IP 기준)로 사용량을 추적한다
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let usage: UsageStatus & { allowed: boolean };
  if (user) {
    const plan = await getUserPlan(supabase);
    usage = await checkPlanUsage(supabase, "idea", plan);
  } else {
    const ip = getClientIp(request);
    usage = consumeIdeaUsage(ip);
  }

  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: "今月の無料アイデア生成回数の上限に達しました。来月またご利用いただくか、有料プランをご検討ください。",
        limitExceeded: true,
        usage: { remaining: usage.remaining, limit: usage.limit } satisfies UsageStatus,
      },
      { status: 429 },
    );
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: buildPrompt({ title, channelTitle, viewCount, multiplierPercent }),
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude APIへのリクエストに失敗しました (status ${res.status})`);
    }

    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";

    return NextResponse.json({
      idea: parseIdeaResult(text),
      usage: { remaining: usage.remaining, limit: usage.limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "アイデア生成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildPrompt({
  title,
  channelTitle,
  viewCount,
  multiplierPercent,
}: {
  title: string;
  channelTitle: string;
  viewCount?: number;
  multiplierPercent?: number;
}) {
  return `あなたは日本のYouTube市場に精通したバズるコンテンツの企画専門家です。
以下のバズった動画を分析し、指定されたJSON形式のみで日本語で回答してください。前後に説明文やコードブロックは付けないでください。

【動画情報】
タイトル: ${title}
チャンネル名: ${channelTitle}
再生回数: ${viewCount !== undefined ? `${viewCount}回` : "不明"}
チャンネル平均比: ${multiplierPercent !== undefined ? `+${multiplierPercent}%` : "不明"}

【出力するJSON形式】
{
  "viralAnalysis": "この動画がバズった理由の分析(2〜3行)",
  "titleIdeas": ["自分のチャンネルに応用できる動画タイトル案を5個の配列"],
  "thumbnailConcept": "サムネイルのコンセプト提案(1個)",
  "hookScript": "動画冒頭30秒のフック(導入部)の台本案(1個)"
}`;
}

// Claude의 응답 텍스트에서 JSON 객체 부분만 추출해 파싱한다 (코드블록 등으로 감싸 응답하는 경우 대비)
function parseIdeaResult(text: string): IdeaResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AIの応答を解析できませんでした。");
  }

  const parsed = JSON.parse(match[0]);
  return {
    viralAnalysis: String(parsed.viralAnalysis ?? ""),
    titleIdeas: Array.isArray(parsed.titleIdeas) ? parsed.titleIdeas.map(String) : [],
    thumbnailConcept: String(parsed.thumbnailConcept ?? ""),
    hookScript: String(parsed.hookScript ?? ""),
  };
}
