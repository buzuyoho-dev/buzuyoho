-- ============================================================
-- バズ予報 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. 사용자별 기능 사용량 테이블
CREATE TABLE IF NOT EXISTS user_usage (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,          -- 'outlier' | 'idea' | 'niche'
  period_key TEXT NOT NULL,          -- 'YYYY-MM-DD'(일별) 또는 'YYYY-MM'(월별)
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, feature, period_key)
);

-- 2. Row Level Security: 본인 데이터만 접근
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_usage" ON user_usage
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. 원자적 사용량 소비 함수
--    한도 미만이면 count+1, 한도 도달 시 count = limit+1로 표시 (초과 방지)
--    반환: { allowed: boolean, remaining: int, limit: int }
CREATE OR REPLACE FUNCTION consume_feature_usage(
  p_feature    TEXT,
  p_period_key TEXT,
  p_limit      INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  INSERT INTO user_usage (user_id, feature, period_key, count)
  VALUES (auth.uid(), p_feature, p_period_key, 1)
  ON CONFLICT (user_id, feature, period_key)
  DO UPDATE SET
    count = CASE
      WHEN user_usage.count < p_limit THEN user_usage.count + 1
      ELSE p_limit + 1
    END,
    updated_at = NOW()
  RETURNING count INTO v_new_count;

  RETURN jsonb_build_object(
    'allowed',    v_new_count <= p_limit,
    'remaining',  GREATEST(0, p_limit - v_new_count),
    'limit',      p_limit
  );
END;
$$;

-- ============================================================
-- Supabase 대시보드 설정 (SQL로 불가 — UI에서 직접 설정)
-- Authentication > Providers > Google 에서 OAuth 클라이언트 ID/Secret 입력
-- Authentication > URL Configuration > Site URL: http://localhost:3000
-- Redirect URLs: http://localhost:3000/auth/callback
-- ============================================================
