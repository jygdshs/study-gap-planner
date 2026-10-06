-- 8차시: 로그인(이메일+비밀번호) 도입 → 사용자별 데이터 분리
--
-- 실행 순서
--   1) 앱에서 먼저 회원가입한다 (로그인 화면 → 회원가입).
--   2) 아래 'OWNER_EMAIL' 자리에 방금 가입한 이메일을 넣는다. (한 곳만 바꾸면 됨)
--   3) Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 Run.
--
-- 하는 일
--   - 네 테이블에 user_id(로그인한 사용자) 열을 추가하고, 기존 데이터는 모두 OWNER_EMAIL 계정으로 옮긴다.
--   - 새로 만드는 행은 자동으로 지금 로그인한 사용자의 것이 된다 (default auth.uid()).
--   - 고유 조건을 사용자별로 바꾼다 (과목 이름, 요일별 시간, 날짜별 계획 칸).
--   - 익명(anon) 전체 허용 정책을 지우고, "자기 행만 보고 고칠 수 있는" 정책으로 바꾼다.

do $$
declare
  owner uuid;
begin
  select id into owner from auth.users where email = 'OWNER_EMAIL';
  if owner is null then
    raise exception '먼저 앱에서 OWNER_EMAIL 로 회원가입한 뒤 다시 실행하세요. (이메일 오타도 확인)';
  end if;

  alter table subjects add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table study_records add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table weekly_availability add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table plan_items add column if not exists user_id uuid references auth.users(id) on delete cascade;

  update subjects set user_id = owner where user_id is null;
  update study_records set user_id = owner where user_id is null;
  update weekly_availability set user_id = owner where user_id is null;
  update plan_items set user_id = owner where user_id is null;
end $$;

-- 새 행은 로그인한 사용자 것으로
alter table subjects alter column user_id set default auth.uid(), alter column user_id set not null;
alter table study_records alter column user_id set default auth.uid(), alter column user_id set not null;
alter table weekly_availability alter column user_id set default auth.uid(), alter column user_id set not null;
alter table plan_items alter column user_id set default auth.uid(), alter column user_id set not null;

-- 고유 조건을 사용자별로
alter table subjects drop constraint if exists subjects_name_key;
alter table subjects drop constraint if exists subjects_user_name_key;
alter table subjects add constraint subjects_user_name_key unique (user_id, name);

alter table weekly_availability drop constraint if exists weekly_availability_pkey;
alter table weekly_availability add primary key (user_id, day_of_week);

alter table plan_items drop constraint if exists plan_items_plan_date_slot_key;
alter table plan_items drop constraint if exists plan_items_user_date_slot_key;
alter table plan_items add constraint plan_items_user_date_slot_key unique (user_id, plan_date, slot);

create index if not exists subjects_user_id_idx on subjects (user_id);
create index if not exists study_records_user_id_idx on study_records (user_id);
create index if not exists plan_items_user_id_idx on plan_items (user_id);

-- RLS: 익명 전체 허용 → 로그인한 사용자가 자기 행만
alter table subjects enable row level security;
alter table study_records enable row level security;
alter table weekly_availability enable row level security;
alter table plan_items enable row level security;

drop policy if exists "anon full access" on subjects;
drop policy if exists "anon full access" on study_records;
drop policy if exists "anon full access" on weekly_availability;
drop policy if exists "anon full access" on plan_items;

drop policy if exists "own rows" on subjects;
create policy "own rows" on subjects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on weekly_availability;
create policy "own rows" on weekly_availability for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 학습 기록·계획 칸은 '내 과목'에만 붙일 수 있다 (다른 사람 과목 id를 넣는 것 방지)
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

-- Data API 접근 권한: 로그인한 사용자만 (2026-04부터 새 테이블은 자동 노출되지 않으므로 명시)
revoke all on subjects, study_records, weekly_availability, plan_items from anon;
grant select, insert, update, delete on subjects, study_records, weekly_availability, plan_items to authenticated;

notify pgrst, 'reload schema';
