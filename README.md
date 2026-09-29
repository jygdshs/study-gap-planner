# 학습 공백 분석 시스템 (1~6차시)

계획서의 IPO 설계를 그대로 구현한 Next.js + Supabase 프로젝트입니다.

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

## 다음 차시에 이어서 만들 것 (7~8차시)

- (7차시) 계획을 잘 지켰는지 체크하는 기능, 계획 변경 이력 관리
- (8차시) 실제 데이터를 여러 개 넣어가며 입력→처리→출력 전체 흐름 통합 테스트
- 마지막으로 GitHub → Vercel 배포 (README 4번 참고)
