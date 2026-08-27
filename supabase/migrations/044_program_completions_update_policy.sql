-- ฟีดแบ็ก "เกิดข้อผิดพลาด: new row violates row-level security policy (USING expression) for
-- table program_completions" ตอนกด "เซ็ตนี้เสร็จแล้ว" ท่าที่เคยบันทึกจบไปแล้วในวันนั้น (retry/แก้ไข)
-- root cause: recordProgramCompletion (session/page.tsx) ใช้ .upsert(...) ซึ่งเป็น
-- INSERT ... ON CONFLICT DO UPDATE — เมื่อชนกับแถวเดิม (unique user_id+workout_id หรือ
-- user_id+program_exercise_id+completed_at) Postgres จะเดิน path UPDATE ซึ่งต้องผ่าน RLS policy
-- ฝั่ง UPDATE (USING) ด้วย แต่ตารางนี้มีแค่ policy SELECT/INSERT/DELETE ไม่มี UPDATE เลย จึงถูกปฏิเสธ
-- โดยปริยายทุกครั้งที่ชน conflict — ไม่ใช่กรณีพิเศษ แต่เกิดกับการกดจบท่าเดิมซ้ำในวันเดียวกันแบบปกติ

drop policy if exists "Users can update their own program completions" on public.program_completions;
create policy "Users can update their own program completions"
  on public.program_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
