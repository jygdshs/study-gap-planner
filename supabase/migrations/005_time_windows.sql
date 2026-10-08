-- 공부 시간대 + 특정 날 일정
--  1) 요일별 공부 시간에 '시간대'(시작~끝)를 더한다. 시간대 안에서 공부할 시간을 빼고 남는 시간은 쉬는 시간.
--  2) day_schedules: 특정 날짜만 일정이 다를 때 (학원 보강, 가족 행사 등) 그날만 따로 정한 공부 시간·시간대
--
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전하다)

alter table weekly_availability add column if not exists start_time time;
alter table weekly_availability add column if not exists end_time time;

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

alter table day_schedules enable row level security;

drop policy if exists "own rows" on day_schedules;
create policy "own rows" on day_schedules for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Data API 접근 권한: 로그인한 사용자만 (새 테이블은 자동 노출되지 않으므로 명시)
revoke all on day_schedules from anon;
grant select, insert, update, delete on day_schedules to authenticated;

notify pgrst, 'reload schema';
