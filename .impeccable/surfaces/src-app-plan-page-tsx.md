---
version: 1
slug: "src-app-plan-page-tsx"
primary_target: "src/app/plan/page.tsx"
related_targets: ["src/app/page.tsx","src/app/input/page.tsx","src/app/availability/page.tsx","src/app/scores/page.tsx"]
---

# Surface brief: 학습 공백 분석 앱 (전 화면)

Scope: /, /input, /availability, /plan, /scores — mode: Operate.
Audience/job: 고등학생이 공부 후 결과를 입력하고, 우선순위와 요일별 계획을 보고, 이행을 체크한다. 폰·PC 비슷한 비중, 발표 때 프로젝터 시연.
Constraints: 점수·계획 로직과 문구의 사실은 유지. 말투는 객관적 분석 도구.

## Direction contract

THESIS: 학습 계획을 교실 시간표의 요일×교시 격자로 세운다. 과목마다 고정된 단색 블록이 앱 전체에서 그 과목의 정체성이 된다. 흰 카드에 그림자를 얹은 일반 대시보드와 파스텔 게이미피케이션은 거부한다.

OWN-WORLD: 시간표 머리띠 색인 진남색(#18233A) 상단 셸, 서늘한 회녹색 바탕 위에 흰 시트, 그림자 대신 1px 괘선. 과목 색 8종은 흰 글자가 읽히는 진한 단색(파랑·주홍·초록·호박·보라·청록·자주·올리브)으로, 과목 구분에만 쓴다. 학습 점수는 0~100 고정 램프 하나로 표현한다(낮을수록 진한 주홍). 숫자는 Pretendard의 tabular 숫자. 모서리는 2px로 거의 직각.

STORY: 학생은 어느 화면에서든 같은 색으로 과목을 알아보고, 가장 큰 공백(가장 낮은 점수)이 맨 위에 있음을 이해하며, 오늘 열의 블록을 공부하고 체크한 뒤 결과를 입력해 계획을 갱신한다.

FIRST VIEWPORT (/plan): 진남색 상단 바(앱 이름 + 입력/공부 시간/계획/점수 탭). 그 아래 왼쪽 좁은 열에 열 고정 우선순위 순위표(순위·과목 색 칩·과목명·점수 램프 막대·점수)와 이행률 숫자, 오른쪽 넓은 영역에 7일×2교시 시간표 격자. 과목 색 블록으로 채워지고 오늘 열은 두꺼운 진남색 틀과 '오늘' 표시, 각 열 바닥에 공부 가능 시간 용량 막대가 있다. 주 행동 '계획 저장/갱신'은 격자 머리 오른쪽에 둔다. 모바일에서는 순위표가 위, 격자는 가로 스크롤 대신 요일별 행 목록으로 접힌다.

SIGNATURE: 계획 블록 = 시간표 칸. 완료 체크하면 블록에 취소선과 ✓ 도장이 찍히며 블록이 옅어지고, 갱신하면 바뀐 칸만 짧게 다시 채워진다(한 번의 짧은 fill 전환, prefers-reduced-motion 시 없음). Raises: 하루 칸 용량 막대(j-card), 앱 전체 과목 색 고정(Saville), 0~100 단일 램프(star atlas), 열 고정 순위표(split-flap), 그림자 없는 괘선(dev console), 완료=취소선 표시 언어(doujin).

FORM: 교실 시간표 — 내 목록 4번째, seed key b489877d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- 과목이 8개를 넘으면 색이 반복된다(현재 데이터는 2개).
