-- เพิ่มการวัดรอบต้นแขนและรอบต้นขาให้ body_metrics (นอกเหนือจาก น้ำหนัก/body fat/รอบอก/รอบเอว ที่มีอยู่แล้ว)
-- Idempotent รันซ้ำได้ปลอดภัย

alter table public.body_metrics add column if not exists arm_cm numeric;
alter table public.body_metrics add column if not exists thigh_cm numeric;

comment on column public.body_metrics.arm_cm is 'รอบต้นแขน (ซม.)';
comment on column public.body_metrics.thigh_cm is 'รอบต้นขา (ซม.)';
