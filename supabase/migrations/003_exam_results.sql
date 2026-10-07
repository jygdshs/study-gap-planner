-- 실제 시험 성적 (학습 점수가 실제 성적을 얼마나 잘 예측했는지 비교하는 용도)
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run.
-- (002_auth_per_user.sql을 이미 실행한 프로젝트 기준. 여러 번 실행해도 안전하다)

create table if not exists exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_date date not null,
  score numeric not null check (score >= 0),          -- 받은 점수 (원점수)
  max_score numeric not null default 100 check (max_score > 0), -- 만점
  created_at timestamptz not null default now(),
  constraint exam_results_score_le_max check (score <= max_score),
  constraint exam_results_user_subject_date_key unique (user_id, subject_id, exam_date)
);

create index if not exists exam_results_user_id_idx on exam_results (user_id);

alter table exam_results enable row level security;

drop policy if exists "own rows" on exam_results;
create policy "own rows" on exam_results for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- Data API 접근 권한: 로그인한 사용자만 (새 테이블은 자동 노출되지 않으므로 명시)
revoke all on exam_results from anon;
grant select, insert, update, delete on exam_results to authenticated;

notify pgrst, 'reload schema';
