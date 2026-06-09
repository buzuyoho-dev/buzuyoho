-- ============================================================
-- バズ予報 — user_plans 테이블 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. 유저 플랜 테이블
CREATE TABLE IF NOT EXISTS user_plans (
  user_id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                       TEXT NOT NULL DEFAULT 'free',       -- 'free' | 'standard' | 'pro'
  stripe_customer_id         TEXT,
  stripe_subscription_id     TEXT,
  stripe_subscription_status TEXT,                               -- 'active' | 'canceled' | 'past_due' 등
  current_period_end         TIMESTAMPTZ,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS: 본인 플랜만 읽기 가능 (쓰기는 webhook이 service_role로 처리)
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_plan_read" ON user_plans
  FOR SELECT USING (auth.uid() = user_id);
