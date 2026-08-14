-- ฟีดแบ็ก "ยังแสดง 7/8" (หลัง migration 042 + deploy แล้ว) — สาเหตุ: unique index เดิมใน 042
-- (program_completions_user_workout_unique) เป็น partial index ("where workout_id is not null")
-- Postgres จะไม่จับคู่ "ON CONFLICT (user_id, workout_id)" แบบเปล่าๆ (ไม่มี WHERE ในตัว conflict
-- target เอง) เข้ากับ partial index ได้ — ต้องระบุ WHERE predicate เดียวกันซ้ำใน ON CONFLICT ด้วยเป๊ะๆ
-- ซึ่ง Supabase JS client's upsert({ onConflict: 'user_id,workout_id' }) ทำไม่ได้ (ส่งได้แค่ชื่อคอลัมน์)
-- ผลคือทุกครั้งที่กดจบท่า ad-hoc, upsert ไป program_completions พัง (Postgres error "no unique or
-- exclusion constraint matching the ON CONFLICT specification") แต่ recordProgramCompletion (session/
-- page.tsx) ไม่ได้เช็ค error จาก call นี้เลย เลยเงียบหายไป ไม่มี row ถูกสร้างจริง ทำให้ adhocCompletedCount
-- เป็น 0 ตลอด แม้ deploy โค้ด+migration 042 ไปแล้วก็ตาม
--
-- แก้โดยเปลี่ยนเป็น unique index แบบเต็ม (ไม่มี WHERE) แทน — ความหมายเดิมยังอยู่ครบ เพราะ Postgres ถือว่า
-- NULL ไม่ชนกันเองอยู่แล้วภายใต้ unique index ปกติ (แถวที่ program_exercise_id ไม่ใช่ null / workout_id
-- เป็น null หลายแถว ก็ยังไม่ชนกันเหมือนเดิม) แต่ตอนนี้ "ON CONFLICT (user_id, workout_id)" เปล่าๆ จะจับคู่
-- อินเด็กซ์นี้ได้ถูกต้องแล้ว

drop index if exists public.program_completions_user_workout_unique;

create unique index if not exists program_completions_user_workout_unique
  on public.program_completions (user_id, workout_id);
