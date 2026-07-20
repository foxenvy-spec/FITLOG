-- เป้าหมาย cardio ต่อสัปดาห์ (นาที + จำนวนครั้ง) — เก็บในตาราง weekly_volume_targets เดิม
-- (ดู migration 005) แถวเดียวต่อ user อยู่แล้ว จึงเพิ่มคอลัมน์แทนการสร้างตารางใหม่
-- ค่า null = ยังไม่เคยตั้ง แอปจะ fallback ไปใช้ค่า default (ดู lib/weeklyCardioTargets.ts)

alter table public.weekly_volume_targets
  add column if not exists cardio_minutes numeric,
  add column if not exists cardio_sessions numeric;

comment on column public.weekly_volume_targets.cardio_minutes is 'เป้าหมายนาทีคาร์ดิโอต่อสัปดาห์';
comment on column public.weekly_volume_targets.cardio_sessions is 'เป้าหมายจำนวนครั้งคาร์ดิโอต่อสัปดาห์';
