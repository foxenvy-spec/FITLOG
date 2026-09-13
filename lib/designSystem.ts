// FITLOG Design System — semantic layer (Foundation, Phase 1: "Define only")
//
// สร้างขึ้นหลัง audit ทีละหน้าครบ 7 กลุ่ม (Dashboard, Session, Stats+Report, Calendar,
// Program/Exercises, Coach, Profile) — ทุกค่าด้านล่างนี้ไม่ใช่สีใหม่ เป็นแค่การ "ตั้งชื่อตาม role ที่
// พิสูจน์แล้วว่าใช้ตรงกันข้ามหน้า" ให้กับค่าที่มีอยู่แล้วใน COLORS/NEUTRAL (lib/theme.ts) หรือ
// tailwind.config.js เท่านั้น ไม่มีจุดไหนในไฟล์นี้ที่ประกาศ hex ใหม่ที่ไม่เคยถูกใช้จริงมาก่อน
//
// ขอบเขตรอบนี้ (Phase 1): "Define only" — ไฟล์นี้ยังไม่ถูก import ไปใช้แทนที่ COLORS.x/HOME_COLORS.x
// ที่ไหนเลย ห้าม migrate component ใดๆ มาอ้างอิง DS จากไฟล์นี้อย่างเดียวโดยไม่ผ่านการตัดสินใจแยกต่างหาก
// (ดู Phase 2-4 ด้านล่าง) — เป้าหมายตอนนี้คือบันทึก mapping ที่ตกลงกันไว้ ไม่ใช่ลงมือแก้โค้ด
//
// เจตนา: "Same Design System, Different Page UX" — DS ทำให้ *ความหมาย* ของสี predictable ข้ามหน้า
// (เช่น เห็น DS.ai.llm แล้วรู้ทันทีว่า "นี่คือเนื้อหาที่มาจาก LLM จริง" ไม่ใช่ "หน้านี้เป็นหน้า AI เลยใส่
// สีนี้") — ไม่ได้แปลว่าทุกหน้าต้องหน้าตาเหมือนกัน Stats ไม่ต้องใช้ orange ทุกกราฟ, Coach ไม่ต้อง
// เปลี่ยนทุกอย่างเป็น violet, Profile ไม่ต้องมี visual แบบ Dashboard
//
// lib/homeColors.ts (HOME_COLORS) ไม่ถูกรวมเข้าที่นี่ — เป็น Home-specific visualization/brand
// (deep-navy glass surface, orange/cyan accent เฉพาะ Home) คนละชั้นกับ global semantic ด้านล่าง
//
// Migration strategy:
//   Phase 1   — Define only ✅
//   Phase 2   — Token inventory + mapping (COLORS/NEUTRAL/tailwind usage classified DIRECT/SEMANTIC/
//               DOMAIN/VISUALIZATION/BRAND/AMBIGUOUS across the whole app) ✅ — no files touched
//   Phase 3A  — Migrated BottomNav.tsx/SidebarNav.tsx's COLORS.amber (single, unambiguous role: active
//               nav item) to accent.primary ✅
//   Phase 3B  — Migrated NEUTRAL.chipInactive/mutedIcon to border.default/text.mutedChart, but ONLY
//               where the role was unambiguously "chart stroke/grid/tick/tooltip" or a plain border/
//               divider ✅ — this pass is what revealed the naming gaps fixed below
//   Phase 3B.1 (this pass) — DS naming corrections only, zero component files touched. Phase 3B's
//               audit proved 3 of Phase 1's names were narrower than the tokens' real cross-page role:
//               1. NEUTRAL.onAmberText is not "text on the primary accent" — 4 of its 6 usages sit on
//                  moss/cyan/green surfaces, not amber/orange. Removed accent.primaryText; replaced
//                  with text.onAccent, named for the role actually evidenced (dark foreground content on
//                  any solid, saturated status surface — badge, checkmark, button), not tied to one color.
//               2. NEUTRAL.mutedIcon has two real roles that happen to share one hex: chart tick/axis/
//                  tooltip text (kept as text.mutedChart, unchanged — it was already migrated under this
//                  name and is correctly scoped) and inactive-icon/neutral-status text elsewhere
//                  (inactive nav icon in BottomNav/SidebarNav, neutral delta fallback in BodyMetricsRow/
//                  Report, Fitness Score's "Rest" tier label). Added text.mutedIcon for the second role —
//                  same value as text.mutedChart and text.muted's cousin, not text.muted itself, which is
//                  Tailwind's DIFFERENT-VALUED '#ADB1B8' general body/label text. Do not consolidate
//                  text.muted/text.mutedIcon/text.mutedChart into one key — two of the three share a
//                  value by coincidence of evidence so far, not by definition, and text.muted is a
//                  genuinely different hex.
//               3. NEUTRAL.chipInactive also has two roles sharing one hex: border/divider (kept as
//                  border.default, unchanged) and a fill/track surface — the "empty" groove of a
//                  progress bar (FitnessScoreDetailSheet, MetricDetailSheet, Stats Report's goal bar) or
//                  an inactive/no-data marker (Dashboard's untrained day-tick circle, Stats' Radar
//                  chart's no-data dot). Added surface.inactive for this second role, after inventorying
//                  every chipInactive usage in the app (6 fill-role call sites found, 0 more border-role
//                  ones than what Phase 3B already migrated) — named "inactive" rather than "track"
//                  because 2 of the 6 are point/circle markers, not progress-bar grooves, and "inactive"
//                  is what NEUTRAL.chipInactive's own original definition in lib/theme.ts already says
//                  ("ชิป/วงกลมที่ยังไม่ active").
//               No component file was migrated to any of these three corrected/added keys in this pass —
//               that's Phase 3C, now that the vocabulary is settled.
//   Phase 3C  — Context-aware migration of amber/rust/steel/violet, which have confirmed dual roles
//               (rust: danger vs. domain.cardio; steel: domain.strength vs. the shared progress-vs-
//               target tier system in WeeklyVolume/WeeklyMuscleHeatmap/WeeklyCardioVolume; violet: ai.llm
//               vs. PR-highlight distinctiveness in Stats) — never migrate these by color name, only by
//               the role confirmed at each call site
//   Phase 4   — Known inconsistencies, fixed only after Phase 3 is otherwise done (Stats/Report's MINT
//               Coach card using violet despite being rule-based; Stats' 1RM Trend chart using rust
//               against the steel=strength convention; Program's steel-colored success message where
//               moss is used everywhere else)

import { COLORS, NEUTRAL } from './theme'

export const DS = {
  // Primary / general interaction accent — ยืนยันตรงกันทุกหน้าที่ตรวจ: segmented control ทั่วไป
  // (หน่วยน้ำหนัก kg/lb, เพศ ใน Profile), temporal selection (วันที่ใน Calendar, timeframe pill ใน
  // Stats, วันในสัปดาห์ใน Program), ปุ่ม CTA หลัก, ผลลัพธ์ AI Coach แบบ rule-based, goal/progress
  // emphasis — "amber = temporal selection" (สมมติฐานจากรอบ Program/Exercises) ถูกยกเลิกแล้วหลัง
  // Profile พิสูจน์ว่า segmented control ทั่วไปก็ใช้ amber เหมือนกัน ไม่ใช่แค่การเลือกวัน/เวลา
  accent: {
    primary: COLORS.amber,
  },

  // ความหมายที่ไม่ขึ้นกับหน้าไหนหน้าหนึ่งโดยเฉพาะ
  semantic: {
    success: COLORS.moss, // เป้าหมายสำเร็จ, trend ดีขึ้น, PR ใหม่
    danger: COLORS.rust, // ลบ/destructive, ข้อความ error, deload warning
    // ยังไม่มีหลักฐานข้ามหน้าสำหรับ "warning" (เตือนแต่ยังไม่ถึงขั้น destructive) หรือ "info" (ข้อมูล
    // ทั่วไปที่เป็นกลาง) ที่แยกออกจาก accent.primary/danger ชัดเจน — ห้ามเดาใส่ค่าไว้ก่อน เพิ่มเมื่อ
    // เจอเคสข้ามหน้าจริงเท่านั้น (COLORS.steel เดิมมี comment ว่าตั้งใจให้เป็น "ข้อมูลทั่วไป" แต่จาก
    // audit จริงพบว่าถูกใช้แทบทั้งหมดในบริบท strength/workout — ดู domain.strength ด้านล่าง จึงไม่ย้าย
    // มาเป็น semantic.info ตรงๆ)
  },

  // ผูกสีกับ "โดเมนการฝึก" ที่เจาะจง ไม่ใช่ "selected/active" แบบกว้างๆ — แคบกว่าที่คิดไว้ตอนแรก (ดู
  // comment ที่ accent.primary ด้านบน)
  domain: {
    // Calendar (จุดมาร์กวัน strength), Program/Exercises (chip เลือกกลุ่มกล้ามเนื้อ — "ทั้งหมด"/
    // per-exercise), Stats (กราฟ Weekly Volume), Session (พื้นฐานของ palette เดิมก่อน migrate ไป
    // HOME_COLORS.cyan)
    strength: COLORS.steel,
    // Calendar (จุดมาร์กวัน cardio), Stats (กราฟระยะทางคาร์ดิโอ) — ใช้ค่าเดียวกับ semantic.danger
    // โดยตั้งใจ ไม่ใช่ bug: บริบทนี้คือ "อัตลักษณ์ของกราฟ/หมวดข้อมูล" ไม่ใช่ "แย่/อันตราย" — ห้ามตีความ
    // ว่า rust แปลว่า "แย่" เสมอไปเวลาเจอในกราฟ ต้องดูบริบทก่อน (ดู Phase 4: Stats's 1RM Trend chart
    // ก็ใช้ rust เหมือนกันทั้งที่เป็นข้อมูล strength ไม่ใช่ cardio — นี่คือ known inconsistency ที่รอ
    // แก้ในรอบนั้น ไม่ใช่ตัวอย่างของ role นี้)
    cardio: COLORS.rust,
    // recovery/readiness ไม่ใช่สีเดียวคงที่ — เป็น tier ที่คำนวณต่อค่า % (ดู lib/recoveryScore.ts's
    // tierForPct/recoveryTier และ lib/dashboardStats.ts's recoveryTier ตัวที่เทียบเท่ากัน) ซึ่งคืนค่า
    // ระหว่าง strength(steel)/accent.primary(amber)/danger(rust) อยู่แล้วต่อ tier — ไม่ประกาศ flat
    // hex ซ้ำที่นี่ ให้เรียกฟังก์ชันเดิมแทน
  },

  // แยก "เนื้อหาที่มาจาก LLM จริง" ออกจาก "ตรรกะ/กฎที่แอปคำนวณเองแล้วพูดในน้ำเสียง AI Coach" — เป็น
  // finding ที่หนักแน่นที่สุดของทั้ง audit (มาจาก /coach ที่มีทั้งสองแบบอยู่ในหน้าเดียวกันให้เทียบตรงๆ)
  // ไม่ใช่ "หน้านี้เกี่ยวกับ AI เลยใส่สีนี้"
  ai: {
    // AICoachCompactCard (Dashboard), Coach page's dailySummary/แนะนำโปรแกรม — คำนวณจาก
    // recovery/balance formula ทันที ไม่เรียก LLM เลย — ใช้ค่าเดียวกับ accent.primary โดยตั้งใจ
    ruleBased: COLORS.amber,
    // เฉพาะจุดที่เรียก Gemini จริงเท่านั้น: Coach page's "ขอคำแนะนำเชิงลึกจาก AI"
    // (/api/ai-coach-insight), "ให้ AI ปรุงแต่งท่า" (/api/generate-workout)
    llm: COLORS.violet,
    // Stats/Report's "MINT Coach" card (composeReportSummary ใน lib/workoutReport.ts) ใช้ violet
    // ทั้งที่เป็น rule chain ล้วนๆ ไม่เรียก model — confirmed inconsistency ตาม convention นี้ แต่
    // ตั้งใจไม่แก้ในไฟล์นี้/รอบนี้ (Phase 4 เท่านั้น หลัง semantic layer นี้ถูกนำไปใช้จริงบ้างแล้ว)
  },

  // Surface ระดับ global จริงๆ (มาจาก tailwind.config.js ไม่ใช่ lib/theme.ts) — ใช้ร่วมกันทุกหน้า
  // ไม่ใช่ของ Home โดยเฉพาะ แยกจาก lib/homeColors.ts's HOME_COLORS ซึ่งเป็น variant ภาพเฉพาะ Home
  // (deep-navy + glass card) ไม่ใช่ default ของทั้งแอป
  surface: {
    bg: '#0B0B0B', // tailwind `bg`
    // tailwind `surface` — ค่าเดียวกับ literal '#1C1F24' ที่เจอซ้ำๆ เป็น background ของ recharts
    // Tooltip ในหลายหน้า (Stats, Program/Exercises' 1RM chart) เพราะไม่มีค่านี้ export เป็น JS
    // constant มาก่อน (มีแค่ใน tailwind.config.js ซึ่ง import เข้า runtime ตรงๆ ไม่ได้) — ตอนนี้มีชื่อ
    // อ้างอิงแล้วผ่าน DS.surface.card
    card: '#1C1F24',
    card2: '#23272D', // tailwind `surface2`
    // NEUTRAL.chipInactive เดิม เฉพาะบริบทที่มันเป็น fill/พื้นผิว (ไม่ใช่เส้นขอบ — ดู border.default
    // ด้านล่างสำหรับ role นั้น) ตรวจครบทุกจุดที่เหลือในแอปแล้ว (6 จุด): progress-bar track ที่ยังไม่เติม
    // (FitnessScoreDetailSheet, MetricDetailSheet, Stats Report's goal bar), วงกลม/จุด "ยังไม่มีข้อมูล"
    // (Dashboard's untrained day-tick circle, Stats' Radar chart's no-data dot, Stats Report's
    // consistency-adherence dot) — ตั้งชื่อ "inactive" ไม่ใช่ "track" เพราะ 2 ใน 6 เป็นจุด/วงกลม ไม่ใช่
    // ร่องแถบ progress ตรงกับความหมายเดิมของ NEUTRAL.chipInactive เองใน lib/theme.ts ("ชิป/วงกลมที่ยัง
    // ไม่ active") พอดี — ยังไม่ migrate component ไหนมาใช้คีย์นี้ในรอบนี้ (Phase 3C)
    inactive: '#2E333A',
  },

  text: {
    // tailwind `ink` — ค่าเดียวกับ literal '#F3F0E8' ที่เจอซ้ำในหลาย recharts Tooltip itemStyle
    primary: '#F3F0E8',
    muted: '#ADB1B8', // tailwind `muted` — text รองทั่วไป (label, caption, ตัวเลขรอง ~700 จุดทั่วแอป)
    // NEUTRAL.mutedIcon เป๊ะ — เฉพาะบริบท recharts tick/axis/tooltip label (มี usage จริงใน Stats/
    // Stats Report/Exercise Detail's 1RM chart แล้ว ตั้งแต่ Phase 3B) อย่าใช้กับ UI ทั่วไปนอกกราฟ
    mutedChart: NEUTRAL.mutedIcon,
    // ค่าเดียวกับ text.mutedChart เป๊ะ (NEUTRAL.mutedIcon ตัวเดียวกัน) แต่คนละบริบทเรียกใช้: ไอคอน nav
    // ที่ไม่ active (BottomNav/SidebarNav), delta ที่เป็นกลางไม่มีทิศทางดี/แย่ (BodyMetricsRow, Stats
    // Report's BodyProgressColumn), ป้าย tier "Rest" ของ Fitness Score — ไม่ใช่ text.muted (Tailwind's
    // '#ADB1B8', คนละค่ากันจริงๆ) ตั้งใจแยกชื่อจาก mutedChart แม้ value เดียวกัน เพื่อให้ตำแหน่งเรียกใช้
    // สื่อความหมายของตัวเองตรงๆ ไม่ใช่ทุกจุดที่ไม่ใช่กราฟแต่ดันถูกเรียกว่า "mutedChart"
    mutedIcon: NEUTRAL.mutedIcon,
    // แทนที่ accent.primaryText เดิม (Phase 1) — NEUTRAL.onAmberText จริงๆ แล้วไม่ได้ผูกกับ amber/
    // primary อย่างเดียว (ตรวจพบใน Phase 3B ว่า 4 ใน 6 จุดที่ใช้จริงอยู่บนพื้น moss/cyan/green ไม่ใช่
    // amber/orange เลย — Dashboard's day-tick checkmark บนพื้น moss, badge "พร้อมลุย" บนพื้น cyan,
    // ปุ่ม "เซ็ตนี้เสร็จแล้ว" ของ Session บนพื้น green ทั้ง text และ background ของ checkmark วงเล็ก) —
    // role จริงคือ "ตัวอักษร/ไอคอนเข้มอ่านง่ายบนพื้นหลังทึบสีอิ่มตัวใดๆ" ไม่ใช่แค่บนสี accent.primary
    onAccent: NEUTRAL.onAmberText,
  },

  border: {
    // tailwind `line` — ค่าเดียวกับ NEUTRAL.chipInactive (คนละชื่อ ความหมายเดิมสองแบบ: `line` = เส้น
    // ขอบทั่วไป, `chipInactive` = ชิป/จุดที่ยังไม่ active — แต่เป็น hex เดียวกันเป๊ะ) — เฉพาะบริบท
    // เส้นขอบ/เส้นแบ่ง/เส้นกราฟ (CartesianGrid/PolarGrid/axisLine, divider, dashed border) เท่านั้น
    default: '#2E333A',
    active: COLORS.amber, // ขอบ input/การ์ดตอน focus หรือถูกเลือก
  },
} as const
