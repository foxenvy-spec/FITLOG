-- 007_exercise_library.sql (แก้ไข)
-- เก็บย้อนหลัง: ตารางนี้มีอยู่แล้วจริงใน production (สร้างตอนทำฟีเจอร์ Exercise Library ครั้งแรก
-- ผ่าน SQL Editor ตรงๆ) แต่ไม่เคย commit ไฟล์ .sql เข้า repo มาก่อน — เขียนไฟล์นี้ขึ้นใหม่จากคอลัมน์
-- ที่โค้ดฝั่งแอปพึ่งพาจริง (ดู lib/exerciseLibrary.ts) เพื่อให้ repo สมบูรณ์ deploy ใหม่ตั้งแต่ต้นได้
--
-- แก้ไขจากเวอร์ชันแรก: ใช้ "create table if not exists" แล้วพังตอนสร้าง index บน user_id
-- เพราะตารางมีอยู่แล้วจริงแต่เป็นเวอร์ชันเก่าที่ไม่มีคอลัมน์ user_id/is_custom (create table
-- if not exists จะไม่ทำอะไรเลยถ้าตารางมีอยู่แล้ว คอลัมน์ใหม่เลยไม่ถูกเพิ่ม) — เวอร์ชันนี้ใช้
-- "alter table add column if not exists" แทน ซึ่งเพิ่มคอลัมน์ที่ขาดได้แม้ตารางมีข้อมูลอยู่แล้ว
-- ทุกคำสั่ง idempotent — รันซ้ำได้อย่างปลอดภัย ไม่ทับ/ไม่ลบข้อมูลเดิม

-- สร้างตารางแบบโครงกระดูกขั้นต่ำก่อน (เผื่อกรณีติดตั้งใหม่ตั้งแต่ต้น ยังไม่มีตารางนี้เลย)
create table if not exists public.exercise_library (
  id text primary key
);

-- เพิ่มคอลัมน์ทีละตัวแบบปลอดภัย ไม่ว่าตารางจะเพิ่งสร้าง หรือมีอยู่แล้วแบบไม่ครบคอลัมน์
alter table public.exercise_library add column if not exists name text;
alter table public.exercise_library add column if not exists name_th text;
alter table public.exercise_library add column if not exists aliases text[] not null default '{}';
alter table public.exercise_library add column if not exists primary_muscle text;
alter table public.exercise_library add column if not exists secondary_muscles text[] not null default '{}';
alter table public.exercise_library add column if not exists equipment text;
alter table public.exercise_library add column if not exists icon text;
alter table public.exercise_library add column if not exists instructions text[] not null default '{}';
alter table public.exercise_library add column if not exists is_custom boolean not null default false;
alter table public.exercise_library add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.exercise_library add column if not exists created_at timestamptz not null default now();

-- เพิ่ม constraint กันแถว custom ที่ไม่มีเจ้าของ (เช็คก่อนว่ายังไม่เคยเพิ่ม กัน error ถ้ารันซ้ำ)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_library_custom_has_owner'
  ) then
    alter table public.exercise_library
      add constraint exercise_library_custom_has_owner
      check (is_custom = false or user_id is not null);
  end if;
end $$;

create index if not exists exercise_library_primary_muscle_idx on public.exercise_library (primary_muscle);
create index if not exists exercise_library_user_id_idx on public.exercise_library (user_id) where user_id is not null;

alter table public.exercise_library enable row level security;

-- ท่ามาตรฐาน (is_custom = false) ทุกคนที่ล็อกอินอ่านได้หมด, ท่า custom เห็นเฉพาะของตัวเอง
drop policy if exists "Everyone can view standard exercises, owners view their custom ones" on public.exercise_library;
create policy "Everyone can view standard exercises, owners view their custom ones"
  on public.exercise_library for select
  using (is_custom = false or auth.uid() = user_id);

-- เพิ่มท่าได้เฉพาะแบบ custom ของตัวเอง (ท่ามาตรฐานจัดการผ่าน SQL Editor/seed migration เท่านั้น ไม่เปิดให้ insert ผ่านแอป)
drop policy if exists "Users can insert their own custom exercises" on public.exercise_library;
create policy "Users can insert their own custom exercises"
  on public.exercise_library for insert
  with check (is_custom = true and auth.uid() = user_id);

drop policy if exists "Users can update their own custom exercises" on public.exercise_library;
create policy "Users can update their own custom exercises"
  on public.exercise_library for update
  using (is_custom = true and auth.uid() = user_id);

drop policy if exists "Users can delete their own custom exercises" on public.exercise_library;
create policy "Users can delete their own custom exercises"
  on public.exercise_library for delete
  using (is_custom = true and auth.uid() = user_id);
