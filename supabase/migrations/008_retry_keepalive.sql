-- 1) 틀린 문제 다시 풀기
--    problem_results에 '어느 PDF 몇 쪽 문항인지'와 '어느 오답을 다시 푼 것인지'를 남긴다.
--    - source_name / source_page: PDF 분석으로 저장할 때 원래 PDF 이름과 쪽 (다시 풀 때 그 쪽을 보여주기 위해)
--    - retry_of: 다시 풀기로 저장한 문항이면, 원래 틀렸던 문항(problem_results.id)
-- 2) Supabase 무료 프로젝트 자동 일시정지 막기
--    7일 동안 접속이 없으면 프로젝트가 멈춘다. Vercel이 하루 한 번 /api/keepalive를 불러
--    아래 keepalive() 함수를 실행한다 (데이터는 읽지 않고 1만 돌려준다).
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

alter table problem_results add column if not exists source_name text;
alter table problem_results add column if not exists source_page integer;
alter table problem_results add column if not exists retry_of uuid references problem_results(id) on delete set null;
create index if not exists problem_results_retry_of_idx on problem_results (retry_of);

create or replace function public.keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1 $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

notify pgrst, 'reload schema';
