-- 정보과학 프로젝트: 학습 공백 분석 및 개인별 학습 계획 추천 시스템
-- 계획서 2번(IPO 설계) "저장할 데이터" 항목을 바탕으로 한 입력 단계 테이블입니다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행(Run)하세요.

-- 1) 과목 (과목명, 과목별 시험 날짜)
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  exam_date date,
  created_at timestamptz not null default now()
);

-- 2) 학습 기록 (단원, 유형별 문제 풀이 / 개념 이해 입력값)
create table if not exists study_records (
  id uuid primary key default gen_random_uuid(),
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

-- 3) 요일별 공부 가능 시간 (월=0 ... 일=6)
create table if not exists weekly_availability (
  day_of_week int primary key check (day_of_week between 0 and 6),
  available_hours numeric not null default 0 check (available_hours >= 0),
  updated_at timestamptz not null default now()
);

insert into weekly_availability (day_of_week, available_hours)
select d, 0 from generate_series(0, 6) as d
on conflict (day_of_week) do nothing;

-- 개발/과제 단계용 RLS: 로그인 기능이 아직 없으므로 익명 키로 전체 CRUD를 허용합니다.
-- (실제 서비스로 확장할 때는 auth.uid() 기반 정책으로 반드시 교체하세요.)
alter table subjects enable row level security;
alter table study_records enable row level security;
alter table weekly_availability enable row level security;

drop policy if exists "anon full access" on subjects;
create policy "anon full access" on subjects for all using (true) with check (true);

drop policy if exists "anon full access" on study_records;
create policy "anon full access" on study_records for all using (true) with check (true);

drop policy if exists "anon full access" on weekly_availability;
create policy "anon full access" on weekly_availability for all using (true) with check (true);

-- 4) [7차시] 저장된 날짜별 학습 계획 + 이행 여부 체크
--    하루에 최대 2칸(slot 0, 1)의 계획을 저장하고, 실제로 지켰는지 completed로 체크한다.
create table if not exists plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  slot int not null check (slot between 0 and 1),
  subject_id uuid not null references subjects(id) on delete cascade,
  unit text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_date, slot)
);

create index if not exists plan_items_plan_date_idx on plan_items (plan_date);

alter table plan_items enable row level security;

drop policy if exists "anon full access" on plan_items;
create policy "anon full access" on plan_items for all using (true) with check (true);

-- 새 테이블을 API(PostgREST)가 바로 인식하도록 스키마 캐시를 갱신한다.
notify pgrst, 'reload schema';
