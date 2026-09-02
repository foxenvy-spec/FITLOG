/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background token ล่าสุด #0B0B0B (เดิม #14161A) — ทั้งสองเป็นดำเกือบสนิท ต่างกันน้อยมาก
        // แต่ #0B0B0B ตรงตาม Color spec ที่ให้มาเป๊ะ
        bg: '#0B0B0B',
        surface: '#1C1F24',
        surface2: '#23272D',
        line: '#2E333A',
        ink: '#F3F0E8',
        // ฟีดแบ็ก "Secondary text (label การ์ด 'Weekly Volume'/'Consistency', timestamp, caption) จม
        // กับพื้นหลังมืดเล็กน้อย อยากขยับสว่างขึ้นแบบ token เดียว ไม่ต้องขาว" — ขยับขึ้นเล็กน้อย (ยังอยู่
        // โซนเทากลาง ไม่ใช่เทาสว่าง) ตามหลัก "Supporting = Readable ไม่ใช่ Bright" — ใช้กับ text-muted
        // ~700 จุดทั่วแอป ผลกระทบเป็น token เดียว ไม่ต้องไล่แก้ทีละไฟล์
        // v2 (P0, Typography/Contrast review): ฟีดแบ็กรอบใหม่ชี้ตรงจุดเดิมอีกครั้ง (subtitle/label การ์ด/
        // วันที่/legend/text ใต้ progress bar/text ใน Consistency — ทั้งหมดใช้ text-muted) — ขยับต่ออีก
        // ~12% (ผสมขาว 12% ด้วยสูตรเดียวกับ lighten() ใน lib/theme.ts) ยังอยู่โซนเทากลางเหมือนเดิม ไม่ใช่
        // เทาสว่าง/ขาว แค่อ่านง่ายขึ้นอีกขั้นตามหลัก "Supporting = Readable ไม่ใช่ Bright" เดิม
        // v3 (P0 รอบล่าสุด): ฟีดแบ็ก "secondary text บางจุดยังเล็ก/จางไป (64 เซ็ต · 16 ท่า, รวมสัปดาห์นี้,
        // อยู่ในเป้าหมาย, labels ใต้กราฟ) เก็บ contrast อีกประมาณ 5%" — ขยับต่ออีก ~5% (ผสมขาว 5% บนค่า v2)
        // ยังเป็นการขยับทีละขั้นเล็กๆ ต่อเนื่อง ไม่กระโดดไปเทาสว่าง/ขาว ตามหลักเดิมทุกประการ — font-weight
        // (ส่วนที่สองของฟีดแบ็กรอบนี้) แก้แยกเป็นจุดๆ ที่ระบุมาเจาะจง (ไม่ใช่ token กลาง เพราะ text-muted
        // ใช้กับทั้ง label หมวดหมู่แบบ tracked-uppercase และข้อความข้อมูลจริงปนกันอยู่ ~700 จุด เพิ่มน้ำหนัก
        // ทุกจุดพร้อมกันจะทำให้ label หมวดหมู่ "แข่ง" กับตัวเลข/หัวข้อการ์ดแทน)
        muted: '#ADB1B8',
        steel: '#6C8CA8',
        steeldim: '#3E5266',
        rust: '#C1503A',
        rustdim: '#5C2E24',
        // lightened rust for text — plain rust is 3.52:1 on surface, which fails
        // WCAG AA (4.5:1) for normal-size text. Tuned to also clear 4.5:1 on the
        // darker rustdim-tinted error boxes (login, health), not just flat surface.
        // Only use rust itself for decorative/non-text UI (bars, left-borders),
        // which just needs 3:1.
        rusttext: '#CF715F',
        amber: '#E8A33D',
        // recovery status green (76-100% recovered) — kept muted/earthy to match
        // the rust/amber/steel palette instead of a saturated "traffic light" green
        moss: '#7A9B57',
        mossdim: '#2E3A26',
        // reserved for PR / record-breaking highlights — a distinct 4th accent so
        // personal records stand out from the everyday amber/steel/rust/moss usage
        violet: '#9C7CC4',
        violetdim: '#372B49',
      },
      // Foundation token — v49: ฟีดแบ็ก "แต่ละ Card เริ่มใช้สีคนละแบบ...ถ้ามี Design System ทุกอย่างจะ
      // อิง Token เดียว" — สืบจริงพบว่า PremiumCard/AICoachCompactCard/WeeklyVolume ใช้ rounded-[24px]
      // (magic string ซ้ำกันหลายไฟล์) ขณะที่การ์ดมือเขียนเองในหน้า Dashboard (Hero Workout/Recovery/
      // Weekly Goal/Next Up) และ WeeklyMuscleHeatmap/WeeklyCardioVolume ยังเหลือ rounded-lg (8px) เดิม
      // จากก่อนมี PremiumCard — เพิ่ม token กลางตรงนี้ (rounded-card) ให้ทุกจุดอ้างอิงชุดเดียวกันจริงๆ
      // แทนพิมพ์ 24px ซ้ำเป็น string คนละที่ ไม่ใช่แค่ "บังเอิญเลขตรงกัน"
      borderRadius: {
        card: '24px',
      },
      fontFamily: {
        display: ['var(--font-oswald)', 'var(--font-kanit)'],
        body: ['var(--font-inter)', 'var(--font-plex-thai)'],
        mono: ['var(--font-mono)', 'var(--font-plex-thai)'],
      },
      letterSpacing: {
        widest2: '0.2em',
      },
      // ใช้กับ Toast (components/Toast.tsx) — ป็อปขึ้นเร็วๆ (150ms), ค้างให้อ่านทัน (900ms),
      // แล้วจางหายไป (350ms) รวม 1.4s ตรงกับ setTimeout ที่เอา toast ออกจาก state จริงใน Toast.tsx
      // (ต้องแก้ทั้งคู่พร้อมกันถ้าจะเปลี่ยน duration ไม่งั้น toast จะหายไปกลางอนิเมชันหรือค้างจอเปล่า)
      keyframes: {
        toast: {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.94)' },
          '11%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '75%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
        },
      },
      animation: {
        toast: 'toast 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      // Tailwind's default `order` scale only goes up to 12 (order-1..order-12,
      // plus order-first/last/none). The dashboard grid (app/(app)/dashboard/
      // DashboardView.tsx) uses a single flat 12-col grid with `lg:contents`
      // wrappers so every card can be repositioned purely via `lg:order-N`,
      // and that grid needs values up to 21 (AI Coach, Consistency, the mini
      // stat cards, Next Up, and Weekly Cardio Volume all sit past order-12).
      // Without this extension those classes generate no CSS at all, so the
      // affected cards silently fall back to the browser default `order: 0`
      // and jump to the front of the grid, ahead of order-1..order-12 — which
      // is exactly the "cards showing in the wrong order" bug this fixes.
      order: {
        13: '13',
        14: '14',
        15: '15',
        16: '16',
        17: '17',
        18: '18',
        19: '19',
        20: '20',
        21: '21',
      },
    },
  },
  plugins: [],
}
