-- 개념 의미: AI 정의 + AI 채점
--  - concept_name: 개념 이름 (예: 미분계수). AI에게 정의를 가져오게 할 때 쓴다
--  - reference_source: 기준 의미를 누가 썼는지 ('user' 직접 입력 / 'ai' AI가 가져옴)
--  - concept_score: AI가 매긴 점수(0~100). 비어 있으면 예전처럼 핵심어 일치도로 채점한다
--  - concept_feedback: AI 채점 근거 한두 문장
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)
-- (AI 사용 횟수는 006_problem_analysis.sql의 ai_usage 테이블을 같이 쓴다)

alter table study_records add column if not exists concept_name text;
alter table study_records add column if not exists reference_source text
  check (reference_source is null or reference_source in ('user', 'ai'));
alter table study_records add column if not exists concept_score numeric
  check (concept_score is null or (concept_score >= 0 and concept_score <= 100));
alter table study_records add column if not exists concept_feedback text;

notify pgrst, 'reload schema';
