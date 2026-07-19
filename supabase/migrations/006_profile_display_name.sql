-- ชื่อที่แสดงบน Dashboard (การ์ดทักทายด้านบน) — เดิมดึงจาก email.split('@')[0]
-- เสมอ ไม่มีทางแก้เอง เพิ่มคอลัมน์นี้ให้ผู้ใช้ตั้งชื่อเล่นเองได้ ถ้าเว้นว่างไว้
-- (null) แอปจะ fallback ไปใช้ชื่อที่ตัดจาก email เหมือนเดิม (ดู lib/profile.ts)

alter table public.profiles
  add column if not exists display_name text;
