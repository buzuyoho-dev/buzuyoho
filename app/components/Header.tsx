"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // 초기 로그인 상태 확인
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    // 로그인/로그아웃 상태 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#7c6dfa]/10 bg-[#0a0a0f]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-[#e8e6f0]"
        >
          バズ予報
        </Link>

        <div className="flex items-center gap-3">
          {!ready ? null : user ? (
            <>
              <Link
                href="/mypage"
                className="hidden max-w-[180px] truncate text-xs text-[#e8e6f0]/50 transition-colors hover:text-[#e8e6f0] sm:block"
              >
                {user.email}
              </Link>
              <Link
                href="/mypage"
                className="rounded-md border border-[#7c6dfa]/30 px-3 py-1.5 text-sm text-[#e8e6f0]/70 transition-colors hover:bg-[#7c6dfa]/10"
              >
                マイページ
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-[#7c6dfa]/30 px-3 py-1.5 text-sm text-[#e8e6f0]/70 transition-colors hover:bg-[#7c6dfa]/10"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="rounded-md bg-[#7c6dfa] px-4 py-1.5 text-sm font-medium text-[#0a0a0f] transition-colors hover:bg-[#7c6dfa]/90"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
