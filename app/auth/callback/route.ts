import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Google OAuth 콜백 처리: 인가 코드를 세션으로 교환한 뒤 메인 페이지로 리다이렉트
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, origin));
}
