-- 계획 칸 메모: 그 칸에서 풀 문제집, 쪽, 문제 번호 같은 구체적인 공부 내용을 적는다.
--  note: 메모 (최대 200자). 비어 있으면 null.
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

alter table plan_items add column if not exists note text
  check (note is null or char_length(note) <= 200);

notify pgrst, 'reload schema';
