-- อัปโหลดรูปท่าออกกำลังกาย (exercise_library.image_url) จากในแอปได้ — เดิมทำไม่ได้เลยเพราะ
-- policy "Users can update their own custom exercises" (007_exercise_library.sql) จำกัดไว้แค่
-- is_custom = true and auth.uid() = user_id เท่านั้น ท่ามาตรฐาน (is_custom = false ส่วนใหญ่ในคลัง)
-- เลยแก้ image_url ผ่านแอปไม่ได้เลย ต้องเข้า Supabase Dashboard เอง
--
-- แก้ด้วย RPC function (security definer) ที่จำกัดสิทธิ์เฉพาะคอลัมน์ image_url เท่านั้น แทนที่จะ
-- เปิด policy UPDATE ทั้งแถวให้ท่ามาตรฐาน (ซึ่งจะกว้างเกินไป กระทบคอลัมน์อื่นเช่นชื่อ/กลุ่มกล้ามเนื้อ
-- ที่ตั้งใจให้แก้ผ่าน SQL Editor/seed migration เท่านั้นตามคอมเมนต์เดิม)
create or replace function public.update_exercise_image(p_exercise_id text, p_image_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.exercise_library
  set image_url = p_image_url
  where id = p_exercise_id;
end;
$$;

revoke all on function public.update_exercise_image(text, text) from public;
grant execute on function public.update_exercise_image(text, text) to authenticated;

-- bucket สำหรับรูปท่าออกกำลังกาย — public เพราะรูปเหล่านี้แสดงให้ทุกคนเห็นในแอป (ต่างจาก
-- progress-photos ที่เป็นข้อมูลส่วนตัวรายผู้ใช้ ต้องใช้ signed URL)
insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view exercise images" on storage.objects;
create policy "Anyone can view exercise images"
  on storage.objects for select
  using (bucket_id = 'exercise-images');

drop policy if exists "Authenticated users can upload exercise images" on storage.objects;
create policy "Authenticated users can upload exercise images"
  on storage.objects for insert
  with check (bucket_id = 'exercise-images' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update exercise images" on storage.objects;
create policy "Authenticated users can update exercise images"
  on storage.objects for update
  using (bucket_id = 'exercise-images' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete exercise images" on storage.objects;
create policy "Authenticated users can delete exercise images"
  on storage.objects for delete
  using (bucket_id = 'exercise-images' and auth.role() = 'authenticated');
