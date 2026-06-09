"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // 이미 로그인된 사용자는 메인 페이지로 이동
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(translateError(error.message));
      } else {
        setSuccessMessage(
          "バズ予報へようこそ！\n確認メールをお送りしました。メールボックスをご確認ください。",
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(translateError(error.message));
      } else {
        router.push("/");
        router.refresh();
      }
    }

    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(translateError(error.message));
      setGoogleLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4 py-16">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#e8e6f0]">バズ予報</h1>
          <p className="mt-1 text-sm text-[#9490b0]">
            日本のYouTuber向けAIコンテンツ発掘ツール
          </p>
        </div>

        {/* メインカード */}
        <div className="rounded-xl border border-[#7c6dfa]/20 bg-[#13131a] p-6">
          {/* タブ切り替え */}
          <div className="mb-6 flex gap-1 rounded-lg bg-[#0a0a0f] p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "bg-[#7c6dfa] text-[#0a0a0f]"
                  : "text-[#e8e6f0]/60 hover:text-[#e8e6f0]"
              }`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === "signup"
                  ? "bg-[#7c6dfa] text-[#0a0a0f]"
                  : "text-[#e8e6f0]/60 hover:text-[#e8e6f0]"
              }`}
            >
              新規登録
            </button>
          </div>

          {/* メール/パスワードフォーム */}
          {!successMessage && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#e8e6f0]/70">
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="rounded-lg border border-[#7c6dfa]/30 bg-[#0a0a0f] px-3 py-2.5 text-sm text-[#e8e6f0] placeholder:text-[#e8e6f0]/30 outline-none transition-colors focus:border-[#7c6dfa]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#e8e6f0]/70">
                  パスワード
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={mode === "signup" ? "8文字以上" : "パスワード"}
                  minLength={mode === "signup" ? 8 : undefined}
                  className="rounded-lg border border-[#7c6dfa]/30 bg-[#0a0a0f] px-3 py-2.5 text-sm text-[#e8e6f0] placeholder:text-[#e8e6f0]/30 outline-none transition-colors focus:border-[#7c6dfa]"
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#7c6dfa] py-2.5 text-sm font-medium text-[#0a0a0f] transition-colors hover:bg-[#7c6dfa]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "処理中..."
                  : mode === "login"
                    ? "ログインする"
                    : "新規登録する"}
              </button>
            </form>
          )}

          {/* 회원가입 성공 메시지 */}
          {successMessage && (
            <div className="rounded-md bg-[#7c6dfa]/10 px-4 py-4 text-center">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#7c6dfa]">
                {successMessage}
              </p>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-4 text-xs text-[#e8e6f0]/60 underline underline-offset-2 hover:text-[#e8e6f0]"
              >
                ログインページへ
              </button>
            </div>
          )}

          {/* 구분선 */}
          {!successMessage && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#7c6dfa]/15" />
                <span className="text-xs text-[#9490b0]">または</span>
                <div className="h-px flex-1 bg-[#7c6dfa]/15" />
              </div>

              {/* Google OAuth 버튼 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#7c6dfa]/30 bg-[#0a0a0f] py-2.5 text-sm text-[#e8e6f0]/80 transition-colors hover:border-[#7c6dfa]/60 hover:text-[#e8e6f0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* Google「G」아이콘 */}
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
                  />
                </svg>
                {googleLoading ? "リダイレクト中..." : "Googleでログイン"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Supabase 영어 에러 메시지를 일본어로 변환
function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials"))
    return "メールアドレスまたはパスワードが正しくありません。";
  if (msg.includes("Email not confirmed"))
    return "メールアドレスの確認が完了していません。確認メールをご確認ください。";
  if (msg.includes("User already registered"))
    return "このメールアドレスはすでに登録されています。";
  if (msg.includes("Password should be at least"))
    return "パスワードは8文字以上で入力してください。";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "リクエストが多すぎます。しばらく待ってから再試行してください。";
  return msg;
}
