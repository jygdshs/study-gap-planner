-- 시험 범위: 과목마다 이번 시험에 나오는 단원만 골라 둔다.
--  exam_units: 시험 범위 단원 이름 목록. 비어 있으면(null) 그 과목의 모든 단원이 범위.
--  범위를 정하면 학습 계획에는 그 단원만 들어간다.
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

alter table subjects add column if not exists exam_units text[];

notify pgrst, 'reload schema';
