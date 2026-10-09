-- 정보과학 프로젝트: 학습 공백 분석 및 개인별 학습 계획 추천 시스템
-- 새 Supabase 프로젝트에서 처음 만들 때 쓰는 전체 스키마입니다. (로그인 사용자별 데이터)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행(Run)하세요.
--
-- ※ 이미 예전 스키마(로그인 없음)로 쓰던 프로젝트라면 이 파일 대신
--   supabase/migrations/002_auth_per_user.sql 을 실행하세요. (기존 데이터를 내 계정으로 옮김)
-- ※ 실제 시험 성적 비교(/results)를 쓰려면 이어서 supabase/migrations/003_exam_results.sql 도 실행하세요.
-- ※ 예전에 만든 프로젝트에서 계획 vs 실제 공부 시간을 쓰려면 supabase/migrations/004_plan_minutes.sql 을 실행하세요.
--   (이 파일로 새로 만들었다면 plan_items에 이미 들어 있음)
-- ※ PDF로 틀린 문제를 AI가 유형별로 정리하는 기능은 supabase/migrations/006_problem_analysis.sql 을 실행하세요.
-- ※ 개념 의미의 AI 정의·AI 채점 결과를 저장하려면 이어서 supabase/migrations/007_concept_ai_grading.sql 도 실행하세요.
-- ※ 공부 시간대·특정 날 일정도 예전 프로젝트라면 supabase/migrations/005_time_windows.sql 을 실행하세요.

-- 1) 과목 (과목명, 과목별 시험 날짜)
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  exam_date date,
  created_at timestamptz not null default now(),
  constraint subjects_user_name_key unique (user_id, name)
);

-- 2) 학습 기록 (단원, 유형별 문제 풀이 / 개념 이해 입력값)
create table if not exists study_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  unit text not null,
  record_type text not null check (record_type in ('problem', 'concept')),
  study_date date not null default current_date,

  -- 문제 풀이 유형
  problems_total int check (problems_total is null or problems_total >= 0),
  problems_correct int check (problems_correct is null or problems_correct >= 0),
  problems_wrong int check (problems_wrong is null or problems_wrong >= 0),

  -- 개념 의미 유형
  concept_reference text,
  concept_answer text,

  -- 공통: 대표적인 틀린 이유 3~4개
  wrong_reasons text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists study_records_subject_id_idx on study_records (subject_id);
create index if not exists study_records_study_date_idx on study_records (study_date);

-- 3) 요일별 공부 가능 시간 (월=0 ... 일=6), 사용자마다 7행
create table if not exists weekly_availability (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  available_hours numeric not null default 0 check (available_hours >= 0),
  start_time time, -- 공부 시간대 시작 (없으면 시간대 없이 시간만)
  end_time time,   -- 공부 시간대 끝. 시간대 안에서 공부 시간을 빼고 남는 시간은 쉬는 시간
  updated_at timestamptz not null default now(),
  primary key (user_id, day_of_week)
);

-- 3-1) 특정 날 일정: 그날만 공부 시간·시간대가 다를 때 요일별 설정 대신 쓴다
create table if not exists day_schedules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  available_hours numeric not null default 0 check (available_hours >= 0 and available_hours <= 24),
  start_time time,
  end_time time,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, date),
  constraint day_schedules_window_check check (
    (start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

-- 4) [7차시] 저장된 날짜별 학습 계획 + 이행 여부 체크
--    하루에 최대 2칸(slot 0, 1)의 계획을 저장하고, 실제로 지켰는지 completed로 체크한다.
create table if not exists plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_date date not null,
  slot int not null check (slot between 0 and 1),
  subject_id uuid not null references subjects(id) on delete cascade,
  unit text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  planned_minutes integer check (planned_minutes is null or planned_minutes between 0 and 1440), -- 계획한 시간(분)
  actual_minutes integer check (actual_minutes is null or actual_minutes between 0 and 1440),   -- 실제 공부 시간(분)
  created_at timestamptz not null default now(),
  constraint plan_items_user_date_slot_key unique (user_id, plan_date, slot)
);

create index if not exists plan_items_plan_date_idx on plan_items (plan_date);
create index if not exists subjects_user_id_idx on subjects (user_id);
create index if not exists study_records_user_id_idx on study_records (user_id);
create index if not exists plan_items_user_id_idx on plan_items (user_id);

-- 5) [8차시] RLS: 로그인한 사용자가 자기 행만 보고 고칠 수 있다
alter table subjects enable row level security;
alter table study_records enable row level security;
alter table weekly_availability enable row level security;
alter table plan_items enable row level security;
alter table day_schedules enable row level security;

drop policy if exists "own rows" on day_schedules;
create policy "own rows" on day_schedules for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on subjects;
create policy "own rows" on subjects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on weekly_availability;
create policy "own rows" on weekly_availability for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on study_records;
create policy "own rows" on study_records for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "own rows" on plan_items;
create policy "own rows" on plan_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from subjects s where s.id = subject_id and s.user_id = (select auth.uid()))
  );

-- Data API 접근 권한: 로그인한 사용자만
revoke all on subjects, study_records, weekly_availability, plan_items, day_schedules from anon;
grant select, insert, update, delete on subjects, study_records, weekly_availability, plan_items, day_schedules to authenticated;

-- 새 테이블을 API(PostgREST)가 바로 인식하도록 스키마 캐시를 갱신한다.
notify pgrst, 'reload schema';
