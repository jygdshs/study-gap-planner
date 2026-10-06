# 학습 공백 분석 시스템

계획서의 IPO 설계를 그대로 구현한 Next.js + Supabase 프로젝트입니다.

**배포 주소: https://study-gap-planner.vercel.app** (GitHub `main`에 push하면 Vercel이 자동으로 다시 배포)

**입력(Input)**
- 과목 / 단원 / 유형(문제 풀이·개념 의미) 입력
- 문제 풀이: 문제 풀이 수, 맞은 문제 수, 틀린 문제 수, 틀린 이유
- 개념 의미: 기준 의미, 채점할 의미, 틀린 이유
- 과목별 시험 날짜, 요일별 공부 가능 시간
- 입력한 내용은 모두 Supabase 데이터베이스에 저장됩니다.

**처리(Process) — [`src/lib/scoring.ts`](src/lib/scoring.ts)**
- 문제 풀이: 정답률(맞은 문제 수 ÷ 문제 풀이 수)을 기본 점수로 사용
- 개념 의미: 기준 의미와 채점할 의미의 문자 2-gram 유사도(자카드 유사도)를 기본 점수로 사용
- 최근에 학습했을수록 최대 8점, 시험이 가까울수록 최대 15점을 추가로 감점
  → **학습 점수(0~100)가 낮을수록 우선적으로 공부해야 하는 단원/과목**
- 과목 점수 = 그 과목에 속한 단원들의 학습 점수 평균

**출력(Output)**
- [`/plan`](src/app/plan/page.tsx) — 과목별 우선순위, 요일별(월~일) 개인 학습 계획표
- [`/scores`](src/app/scores/page.tsx) — 작성 일시 × 과목/단원 학습 점수 표, 점수 변화 그래프, 틀린 이유 변화

## 0. 준비물 설치 (이 컴퓨터에는 아직 없어요)

1. [Node.js LTS 버전](https://nodejs.org) 설치 (설치 후 터미널을 새로 열어야 인식됩니다)
2. 설치 확인:
   ```bash
   node -v
   npm -v
   ```

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 무료 계정으로 로그인 후 **New project** 생성
2. 프로젝트가 만들어지면 좌측 메뉴 **SQL Editor** 로 이동
3. 이 저장소의 [`supabase/schema.sql`](./supabase/schema.sql) 내용을 전부 복사해서 붙여넣고 **Run** 실행
   → `subjects`, `study_records`, `weekly_availability` 테이블이 생성됩니다.
4. 좌측 메뉴 **Project Settings > API** 에서 두 값을 복사해 둡니다.
   - `Project URL`
   - `anon public` API key

## 2. 환경 변수 설정

프로젝트 폴더에서 `.env.local.example` 을 복사해 `.env.local` 파일을 만들고, 위에서 복사한 값을 넣습니다.

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...(길게 이어지는 문자열)
```

## 3. 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속 → `① 학습 결과 입력`, `② 요일별 공부 가능 시간`, `③ 요일별 학습 계획 보기`, `④ 학습 점수 보러 가기` 화면 확인.

⚠️ Supabase 무료 플랜은 **7일간 접속이 없으면 프로젝트가 자동으로 일시 정지**됩니다. 오랜만에 열었는데
"Failed to fetch" 오류가 뜨면 대시보드에서 프로젝트를 복구(Restore)한 뒤, SQL Editor에서
`NOTIFY pgrst, 'reload schema';` 를 한 번 실행해 주세요.

입력 후 Supabase 대시보드의 **Table Editor** 에서 `study_records`, `subjects`, `weekly_availability` 테이블에
데이터가 실제로 쌓이는지 확인해 보세요. (계획서 8차시 "구동 확인"에 해당하는 과정입니다.)

## 4. Vercel로 배포하기

### 방법 A — Vercel 웹사이트 (가장 쉬움)
1. 이 폴더를 GitHub 저장소로 올립니다. (계획서 1차시 "깃허브 저장소 만들기")
   ```bash
   git init
   git add .
   git commit -m "feat: 입력 단계 구현 (과목/단원/문제풀이/개념의미/공부가능시간)"
   git branch -M main
   git remote add origin <내 GitHub 저장소 URL>
   git push -u origin main
   ```
2. https://vercel.com 로그인 → **Add New... > Project** → 방금 만든 GitHub 저장소 선택
3. **Environment Variables** 에 `.env.local` 과 똑같이
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 추가
4. **Deploy** 클릭 → 완료되면 `https://프로젝트이름.vercel.app` 주소가 생깁니다.

### 방법 B — Vercel CLI
```bash
npm i -g vercel
vercel login
vercel        # 미리보기 배포
vercel --prod # 실제 서비스 배포
```
CLI로 배포할 때도 `vercel env add` 로 위 두 환경 변수를 등록해야 Supabase 연결이 됩니다.

## 폴더 구조

```
study-app/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx              # 시작 화면 (네 화면으로 이동)
│  │  ├─ input/page.tsx        # 과목·단원·유형·문제풀이/개념의미 입력 화면
│  │  ├─ availability/page.tsx # 요일별 공부 가능 시간 입력 화면
│  │  ├─ plan/page.tsx         # 출력: 과목 우선순위 + 요일별 개인 학습 계획
│  │  └─ scores/page.tsx       # 출력: 학습 점수 표 + 변화 그래프 + 틀린 이유 변화
│  ├─ components/
│  │  ├─ SubjectPicker.tsx     # 과목 선택/추가 (시험 날짜 포함)
│  │  ├─ WrongReasonsInput.tsx # 틀린 이유 3~4개 태그 입력
│  │  └─ ScoreLineChart.tsx    # 학습 점수 변화 SVG 꺾은선 그래프
│  ├─ lib/
│  │  ├─ supabaseClient.ts     # Supabase 클라이언트 생성
│  │  └─ scoring.ts            # 처리(Process): 학습 점수·우선순위·요일별 계획 계산
│  └─ types/study.ts           # 입력/처리 데이터 타입 정의
└─ supabase/schema.sql         # 테이블 생성 SQL (Supabase SQL Editor에서 실행)
```

## 7차시: 계획 이행 체크 — [`src/lib/planTracking.ts`](src/lib/planTracking.ts)

계획서 처리(Process) 마지막 문단 "학습 계획을 잘 지켰는지 확인하고 → 새 학습 점수 → 더 효율적인 계획"을 구현했습니다.

- `/plan` 에서 **이 계획 저장하기** → 7일치 계획이 `plan_items` 테이블에 저장됩니다.
- 오늘까지의 계획 칸은 체크박스로 **지켰는지 체크**할 수 있습니다. (지난 7일 계획도 늦게 체크 가능)
- **최근 7일 이행률** = 완료 체크한 칸 ÷ 저장된 칸
- 계획을 지켰는데 그 뒤로 새 학습 결과를 입력하지 않은 단원은 **결과 입력 필요** 목록에 뜨고,
  `결과 입력 →` 을 누르면 입력 화면에 과목·단원이 미리 채워집니다.
- 새 결과를 입력하면 학습 점수가 바뀌어 추천이 달라지고, **새 학습 점수로 계획 갱신** 버튼이 켜집니다.
  갱신해도 이미 완료 체크한 칸은 기록으로 남습니다.

## 8차시: 시험 일정 + 로그인

### 시험 일정 — [`/exams`](src/app/exams/page.tsx)
- 과목마다 시험 날짜를 넣으면 학습 계획이 **오늘부터 마지막 시험 전날까지** 세워집니다. (최대 60일)
- 시험 일정이 없으면 지금처럼 **7일** 계획입니다.
- 날짜마다 그날 기준으로 학습 점수를 다시 계산합니다([`scoring.ts`](src/lib/scoring.ts) `buildStudyPlan`).
  시험이 가까운 과목일수록 감점이 커져 먼저 배정되고, **시험을 본 날부터 그 과목은 계획에서 빠집니다.**
- 같은 단원이 이미 배정된 횟수만큼 가중치를 더해, 가장 취약한 단원이 앞쪽 날에 먼저·자주 들어가면서 다른 단원도 골고루 돕니다.
- 계획 기간이 7일보다 길면 학습 계획 화면에서 주 단위 탭(1주차, 2주차…)으로 나눠 봅니다.

### 로그인 (이메일 + 비밀번호)
- 로그인하지 않으면 모든 화면이 로그인 화면으로 이동합니다. 같은 계정으로 들어오면 다른 기기에서도 같은 데이터가 보입니다.
- 데이터는 DB의 RLS 정책으로 **자기 행만** 읽고 쓸 수 있습니다.

**기존 프로젝트에 적용하는 순서**
1. 앱을 실행해 로그인 화면에서 **회원가입** (이메일 인증 메일이 오면 링크 클릭)
2. [`supabase/migrations/002_auth_per_user.sql`](supabase/migrations/002_auth_per_user.sql) 의 `OWNER_EMAIL` 을 방금 가입한 이메일로 바꾼 뒤 SQL Editor에서 실행
   → 기존 데이터가 모두 그 계정으로 옮겨지고, 사용자별 RLS가 켜집니다.
3. Supabase 대시보드 **Authentication > URL Configuration** 의 *Site URL* / *Redirect URLs* 에
   `http://localhost:3000` 과 Vercel 배포 주소를 넣어 둡니다. (인증 메일 링크가 돌아올 주소)

> 새 Supabase 프로젝트라면 `supabase/schema.sql` 하나만 실행하면 처음부터 사용자별 구조로 만들어집니다.
