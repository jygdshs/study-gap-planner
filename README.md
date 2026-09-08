# 학습 공백 분석 시스템 — 입력 단계 (1~3차시)

계획서의 IPO 설계 중 **입력(Input)** 부분만 구현한 Next.js + Supabase 프로젝트입니다.
- 과목 / 단원 / 유형(문제 풀이·개념 의미) 입력
- 문제 풀이: 문제 풀이 수, 맞은 문제 수, 틀린 문제 수, 틀린 이유
- 개념 의미: 기준 의미, 채점할 의미, 틀린 이유
- 과목별 시험 날짜, 요일별 공부 가능 시간
- 입력한 내용은 모두 Supabase 데이터베이스에 저장됩니다.

처리(학습 점수 계산)와 출력(개인별 학습 계획 화면)은 다음 차시에서 이어서 구현하면 됩니다.

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

브라우저에서 http://localhost:3000 접속 → `① 학습 결과 입력`, `② 요일별 공부 가능 시간` 화면 확인.

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
│  │  ├─ page.tsx            # 시작 화면 (두 입력 화면으로 이동)
│  │  ├─ input/page.tsx      # 과목·단원·유형·문제풀이/개념의미 입력 화면
│  │  └─ availability/page.tsx # 요일별 공부 가능 시간 입력 화면
│  ├─ components/
│  │  ├─ SubjectPicker.tsx   # 과목 선택/추가 (시험 날짜 포함)
│  │  └─ WrongReasonsInput.tsx # 틀린 이유 3~4개 태그 입력
│  ├─ lib/supabaseClient.ts  # Supabase 클라이언트 생성
│  └─ types/study.ts         # 입력 데이터 타입 정의
└─ supabase/schema.sql       # 테이블 생성 SQL (Supabase SQL Editor에서 실행)
```

## 다음 차시에 이어서 만들 것 (처리·출력)

- `study_records`, `subjects`, `weekly_availability` 를 불러와 계획서 2번의 "처리(Process)" 규칙대로
  과목별/단원별 학습 점수를 계산하는 함수 작성
- 학습 점수를 바탕으로 요일별 개인 학습 계획을 만들어 `/plan` 같은 출력 화면에 표시
- 새 학습 결과가 들어올 때마다 계획을 다시 계산하는 로직 추가
