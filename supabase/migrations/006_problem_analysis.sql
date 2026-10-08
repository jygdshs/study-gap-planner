-- AI 문제 유형 분석 (Gemini)
--  1) problem_results: 문제 PDF + 틀린 번호를 올리면 AI가 틀린 문항만 정리한 결과
--     (과목·단원은 사용자가 정하고, 문항마다 문제 유형·필요한 개념·틀린 원인을 저장)
--     학습 기록(study_records) 한 건에 문항 여러 개가 달린다. 기록을 지우면 같이 지워진다.
--  2) ai_usage: 하루 분석 횟수 (무료 사용 한도를 아끼도록 서버에서 확인)
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

create table if not exists problem_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id uuid not null references study_records(id) on delete cascade,
  problem_no text not null,                 -- 문항 번호 (예: "3", "5-2")
  correct boolean not null,
  problem_type text not null,               -- 문제 유형 (예: 단순 계산, 개념 적용, 그래프 해석)
  cause text check (cause is null or cause in ('계산 실수', '개념 부족', '문제 이해', '시간 부족', '기타')),
  detail text,                              -- 학생 메모 (왜 틀렸는지, 선택)
  summary text,                             -- 무엇을 묻는 문제인지 한 줄
  concept text,                             -- 풀려면 필요한 핵심 개념
  created_at timestamptz not null default now()
);

-- 예전 버전의 이 파일을 이미 실행했어도 열이 생기도록
alter table problem_results add column if not exists summary text;
alter table problem_results add column if not exists concept text;

create index if not exists problem_results_user_id_idx on problem_results (user_id);
create index if not exists problem_results_record_id_idx on problem_results (record_id);

alter table problem_results enable row level security;

drop policy if exists "own rows" on problem_results;
create policy "own rows" on problem_results for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from study_records r where r.id = record_id and r.user_id = (select auth.uid()))
  );

create table if not exists ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

drop policy if exists "own rows" on ai_usage;
create policy "own rows" on ai_usage for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Data API 접근 권한: 로그인한 사용자만 (사용 횟수는 지울 수 없게 delete는 주지 않는다)
revoke all on problem_results, ai_usage from anon;
grant select, insert, update, delete on problem_results to authenticated;
grant select, insert, update on ai_usage to authenticated;

notify pgrst, 'reload schema';
