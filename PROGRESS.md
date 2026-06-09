# バズ予報 — 개발 진행 상황

## 완료된 작업

### 1. 프로젝트 초기 설정
- Next.js (TypeScript + Tailwind CSS + App Router) 프로젝트 생성
- 다크 테마 적용 (배경 `#0a0a0f`, 강조색 `#7c6dfa`, 텍스트 `#e8e6f0`)
- 메인 페이지 기본 골격: "ジャンルを入力してください" 안내문 + 입력창 + `予報する` 버튼

### 2. 아웃라이어 탐색 기능
- `app/api/outliers/route.ts`: YouTube Data API v3 연동
  - `search.list`로 일본 지역(JP)·일본어 영상 검색 (최근 90일, 조회수순)
  - `videos.list`로 영상별 조회수 조회
  - `channels.list`로 채널 누적 조회수 ÷ 업로드 영상 수 = 평균 조회수 계산
  - 채널 평균 대비 10배 이상(`OUTLIER_THRESHOLD`) 조회된 영상만 필터링, `평균比 +N%` 계산
- `app/page.tsx`: 클라이언트 컴포넌트로 전환, 검색 결과를 그리드 카드(`OutlierCard`)로 표시
  - 카드 구성: 썸네일, 제목, 채널명, 조회수, `平均比 +1,240%` 배지, `このネタでアイデアを生成` 버튼
- 환경변수: `YOUTUBE_API_KEY` (`.env.local`, 설정 완료)

### 3. AI 아이디어 생성 기능
- `app/api/idea/route.ts`: Claude API(`claude-sonnet-4-6`) 연동
  - 선택한 영상의 제목·채널명·조회수·평균比 정보를 일본어 프롬프트로 전송
  - JSON 형식으로 분석 결과를 받아 파싱: 바이럴 이유 분석, 제목 아이디어 5개, 썸네일 콘셉트, 첫 30초 훅 스크립트
- `app/page.tsx`: `IdeaModal` 컴포넌트 추가
  - `このネタでアイデアを生成` 클릭 → 모달 오픈 → 로딩 중 `AIが分析中です...` 표시 → 결과를 4개 섹션으로 렌더링
  - 다크 테마 유지, 배경 클릭 시 모달 닫힘
- 환경변수: `ANTHROPIC_API_KEY` (`.env.local`, 입력 완료)

### 4. 요금제별 사용량 제한 (무료 플랜)
- `lib/usageLimiter.ts`: IP 주소 기준 무료 이용 횟수 추적 (비로그인용)
  - 아웃라이어 탐색: 하루 3회, AI 아이디어 생성: 월 10회, 니치 탐색: 하루 2회
  - `globalThis` 싱글톤 패턴 — Next.js Turbopack dev 모드에서 라우트 파일별 모듈 재인스턴스화 문제 해결
  - `getClientIp`: `x-forwarded-for` → `x-real-ip` 순으로 클라이언트 IP 추출
- `app/api/usage/route.ts`: 현재 IP 기준 남은 횟수 조회 API (`GET /api/usage`)
- `app/api/outliers/route.ts`, `app/api/idea/route.ts`: 한도 초과 시 429 응답 + 일본어 안내 메시지

### 5. 검색 정확도 개선 (일본어 필터 강화)
- 입력창 아래 `💡 日本語で入力するとより精度が上がります` 힌트 표시
- `containsJapanese()`: 히라가나/가타카나/한자 포함 여부 검사
- `translateToJapanese()`: 비일본어 입력 → Claude API로 일본어 키워드 번역 후 결합 검색
- 결과 정렬 시 일본어 제목 영상 우선 배치

### 6. 니치 탐색 기능
- `app/api/niche/route.ts`: YouTube Data API + Claude API 연동
  - 구독자 10만 미만 소형 채널에서 조회수 1만 이상 영상 추출 (`opportunityScore`)
  - 데이터 부족 시 threshold 자동 완화 (구독자 50만/조회수 5천)로 재시도
  - Claude API로 서브니치 3개 JSON 추천 (`subNiche`, `description`, `difficulty`, `potentialViewCount`, `contentIdeas`)
- `app/page.tsx`: [アウトライアー探索] / [ニッチ探索] 탭 UI 추가
  - `NicheCard` 컴포넌트: 경쟁도 배지(競合低め/競合普通), 기대 재생수, 콘텐츠 아이디어 3개

### 7. 회원가입/로그인 (Supabase 연동)
- `lib/supabase/client.ts`: `createBrowserClient` (클라이언트 컴포넌트용)
- `lib/supabase/server.ts`: `createServerClient` + `next/headers` 쿠키 (서버용)
- `lib/supabase/usageDb.ts`: DB 기반 사용량 추적 헬퍼
  - `consumeDbUsage()`: `consume_feature_usage` RPC 호출 (원자적 증가)
  - `getDbUsageStatus()`: 현재 사용량 조회 (소비 없음)
- `proxy.ts`: Supabase 세션 쿠키 자동 갱신 (Next.js 16에서 `middleware.ts` deprecated → `proxy.ts`로 교체, `proxy` 함수명으로 export 필요)
  - `/api/stripe/webhook` 경로는 matcher에서 제외 — 미들웨어가 Request를 재구성하면 raw body가 손상되어 Stripe 서명 검증 실패
- `app/auth/page.tsx`: 로그인/회원가입 페이지 (다크 테마)
  - 이메일+비밀번호 탭 전환 (ログイン / 新規登録)
  - Google OAuth 버튼 (G 컬러 아이콘)
  - 회원가입 성공 시 「バズ予報へようこそ！」 환영 메시지
  - 에러 메시지 일본어 변환 (`translateError`)
- `app/auth/callback/route.ts`: Google OAuth 인가 코드 → 세션 교환 후 `/` 리다이렉트
- `app/components/Header.tsx`: 전역 헤더 (sticky, backdrop-blur)
  - 비로그인: [ログイン] 버튼 (→ /auth)
  - 로그인: 이메일 표시 + [マイページ] + [ログアウト]
  - `onAuthStateChange`로 실시간 상태 반영
- `app/layout.tsx`: Header + `<main>` 구조로 변경
- 모든 API 라우트: 로그인 사용자는 Supabase DB, 비로그인은 서버 메모리(IP 기준) 분리 추적
- `supabase/schema.sql`: `user_usage` 테이블 + RLS + `consume_feature_usage()` Postgres 함수

### 8. Stripe 결제 연동
- `lib/stripe.ts`: Stripe SDK 인스턴스 (`apiVersion: "2026-05-27.dahlia"`) + 가격 ID → 플랜명 매핑
- `supabase/add_user_plans.sql`: `user_plans` 테이블 + RLS (SELECT만 허용, 쓰기는 service_role)
- `lib/supabase/usageDb.ts` 확장:
  - `getUserPlan()`: 활성 구독 기반 플랜 반환 (`'free' | 'standard' | 'pro'`)
  - `getPlanLimit()`: 플랜별 한도 (standard: idea 100/월 외 무제한 / pro: 전체 무제한 → limit≥9999이면 DB 호출 생략)
  - `checkPlanUsage()`, `getPlanUsageStatus()`: 플랜 인식 사용량 소비/조회
- 모든 API 라우트: `getUserPlan()` → `checkPlanUsage()` 통합 (로그인 시 DB, 비로그인 시 메모리)
- `app/api/plan/route.ts`: `GET /api/plan` — 현재 플랜/상태/갱신일 조회
- `app/api/stripe/checkout/route.ts`: Checkout 세션 생성 (로그인 필수, 기존 customer ID 재사용, locale: "ja")
- `app/api/stripe/portal/route.ts`: Customer Portal 세션 생성 (구독 관리/해약, return_url: /mypage)
- `app/api/stripe/webhook/route.ts`: 웹훅 서명 검증 + 이벤트 처리
  - `Buffer.from(await request.arrayBuffer())` 사용 — `request.text()` 대신 사용해야 인코딩 차이 없이 정확한 바이트 전달
  - `checkout.session.completed` → user_plans upsert
  - `customer.subscription.updated` → 플랜/상태 갱신
  - `customer.subscription.deleted` → plan='free' 복귀
  - `supabaseAdmin` (service_role 키) 로 RLS 우회
- `app/mypage/page.tsx`: 마이페이지
  - 현재 플랜 배지 (フリー/スタンダード/プロ) + 갱신일
  - 사용량 현황 바 (무제한이면 "無制限" 표시, 90% 이상이면 빨간색)
  - 유료 미가입 시 업그레이드 카드 (スタンダード ¥500/プロ ¥1,200)
  - 유료 가입 시 "プランを解約する" → Stripe Portal
  - 스탠다드 가입 시 프로 업그레이드 카드 추가 표시
  - 결제 완료 후 `/mypage?payment=success` 시 성공 메시지
- `app/components/Header.tsx`: 로그인 시 이메일(→/mypage 링크) + [マイページ] + [ログアウト]

## 환경변수 현황 (`.env.local`)
| 변수명 | 상태 |
|--------|------|
| `YOUTUBE_API_KEY` | ✅ 설정 완료 |
| `ANTHROPIC_API_KEY` | ✅ 설정 완료 |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ 설정 완료 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ 설정 완료 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ 설정 완료 |
| `STRIPE_SECRET_KEY` | ✅ 설정 완료 |
| `STRIPE_WEBHOOK_SECRET` | ✅ 설정 완료 (`stripe listen` 실행 시 발급된 값, 세션 재시작 시 갱신 필요) |
| `NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID` | ✅ 설정 완료 |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | ✅ 설정 완료 |

## Supabase 설정 (대시보드에서 직접 실행 필요)
- [ ] `supabase/schema.sql` — SQL Editor에서 실행 (user_usage 테이블 + consume_feature_usage 함수)
- [ ] `supabase/add_user_plans.sql` — SQL Editor에서 실행 (user_plans 테이블)
- [ ] Authentication > Providers > Google — Google OAuth 클라이언트 ID/시크릿 설정

## 검증 상태
- Playwright 스크린샷으로 메인/로그인/신규등록 UI 확인 완료
- 비로그인 `/mypage` 접근 시 `/auth` 자동 리다이렉트 확인
- API 엔드포인트 상태:
  - `GET /api/plan` → `{"plan":"free","status":null,...}` ✅
  - `GET /api/usage` → `{"outlier":{"remaining":3,"limit":3},...}` ✅
  - `POST /api/stripe/checkout` 비로그인 → 401 "ログインが必要です" ✅
  - `POST /api/stripe/portal` 비로그인 → 401 "ログインが必要です" ✅
  - `POST /api/stripe/webhook` 서명 없음 → 400 "署名がありません" ✅
- 웹훅 서명 검증: `STRIPE_WEBHOOK_SECRET`이 현재 실행 중인 `stripe listen` 세션과 일치해야 통과
  - `stripe listen` 재시작 시 새 `whsec_...` 발급 → `.env.local` 갱신 + 서버 재시작 필요

## 알려진 이슈
- `STRIPE_WEBHOOK_SECRET` 불일치: `stripe listen`을 재시작하면 새 시크릿이 발급됨
  - 해결: `stripe listen --forward-to localhost:3000/api/stripe/webhook` 재실행 → 출력된 `whsec_...` 값으로 `.env.local` 업데이트

## 개발 환경
- Git 저장소: `C:\Users\ritch\buzuyoho`
- `.env.local`은 `.gitignore`의 `.env*` 패턴으로 커밋에서 제외됨
- 로컬 결제 테스트: `stripe listen --forward-to localhost:3000/api/stripe/webhook` 실행 중 유지 필요
- Stripe 테스트 카드: `4242 4242 4242 4242` / 만료 `12/34` / CVC `123`

## 다음 작업 후보
- 쇼츠 전용 탐색: 일본 유튜브 쇼츠 바이럴 포맷 필터링
- Vercel 배포 (프로덕션 웹훅은 Stripe 대시보드에 엔드포인트 등록 필요)
