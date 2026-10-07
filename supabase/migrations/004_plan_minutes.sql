-- 계획 vs 실제 공부 시간
--  planned_minutes: 계획을 저장할 때 그 칸에 배정된 시간(분)
--  actual_minutes : 실제로 공부한 시간(분) — 학습 계획 화면에서 직접 입력
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

alter table plan_items add column if not exists planned_minutes integer
  check (planned_minutes is null or planned_minutes between 0 and 1440);
alter table plan_items add column if not exists actual_minutes integer
  check (actual_minutes is null or actual_minutes between 0 and 1440);

notify pgrst, 'reload schema';
