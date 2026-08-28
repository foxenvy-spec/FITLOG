import type { Insight } from './dashboardStats'

export type Zone = 'Low' | 'Standard' | 'High'
export type Direction = 'lowerBetter' | 'higherBetter' | 'neutral'

export function zoneOf(value: number, low: number, high: number): Zone {
  if (value < low) return 'Low'
  if (value > high) return 'High'
  return 'Standard'
}

// จัดกลุ่มตัวชี้วัดเป็น "ดีมาก / มาตรฐาน / ควรปรับปรุง" ตามโซนและทิศทางที่ดีของแต่ละตัว
// (เช่น ไขมันยิ่งต่ำยิ่งดี, กล้ามเนื้อยิ่งสูงยิ่งดี, น้ำหนัก/BMI ควรอยู่ในช่วงมาตรฐาน)
export function classifyMetric(zone: Zone, direction: Direction): 'good' | 'standard' | 'needsWork' {
  if (zone === 'Standard') return 'standard'
  if (direction === 'neutral') return 'needsWork'
  if (direction === 'lowerBetter') return zone === 'Low' ? 'good' : 'needsWork'
  return zone === 'High' ? 'good' : 'needsWork'
}

export interface ScoredMetric {
  label: string
  status: 'good' | 'standard' | 'needsWork'
}

export function summarizeHealthScore(items: ScoredMetric[]) {
  const good = items.filter((i) => i.status === 'good').length
  const standard = items.filter((i) => i.status === 'standard').length
  const needsWork = items.filter((i) => i.status === 'needsWork').length
  const total = items.length
  // นับ "ดีมาก" และ "มาตรฐาน" รวมกันเป็นคะแนนของวงแหวนสรุป (ทั้งสองแบบถือว่าอยู่ในเกณฑ์โอเค)
  const score = total > 0 ? good + standard : 0
  return { good, standard, needsWork, total, score }
}

// v29: ฟีดแบ็ก "Insight 4 การ์ดควรเรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี ให้เป็น Coach ไม่ใช่แค่ Report" —
// ลำดับการแสดงผล ไม่ใช่แค่การเรียงตามลำดับที่ตรวจพบ (bodyFat -> muscle -> weight -> bodyAge เดิม)
// v68: ฟีดแบ็ก "แยก ℹ️ Tracking ออกจาก 🟡 ควรติดตาม" — เพิ่ม tracking แทรกระหว่าง watch กับ good (สัญญาณเตือน
// จริง > ข้อมูลติดตามเฉยๆ > ทำได้ดี)
const TIER_ORDER: Record<'attention' | 'watch' | 'tracking' | 'good', number> = { attention: 0, watch: 1, tracking: 2, good: 3 }

// v49: ฟีดแบ็ก "Top Summary บอก ↓0.4% ไขมัน จากสัปดาห์ที่แล้ว แต่ Insight ด้านล่างบอก ไขมันเพิ่มขึ้น 3.7%
// ทำให้ผู้ใช้สงสัยว่าตัวเลขไหนถูก — สาเหตุจริงคือคนละฐานเวลากันเลย: Top Summary ใช้ fieldDelta (ล่าสุด vs
// เอนทรีก่อนหน้าล่าสุด อาจห่างกันแค่ไม่กี่วัน) ส่วน Insight นี้ใช้ periodMetrics/trendPeriodDays (ค่าเริ่มต้น
// 90 วัน) แต่ detail เดิมบอกแค่ 'จากช่วงที่แล้ว' ลอยๆ ไม่บอกว่ากี่วัน (บาง template ไม่บอกช่วงเวลาเลยด้วยซ้ำ
// เช่น มวลกล้ามเนื้อ) — เพิ่ม periodLabel บังคับให้ทุก detail ต้องระบุช่วงเวลาจริงชัดเจน (เช่น "ในช่วง 90
// วันที่ผ่านมา") ผู้ใช้จะเห็นทันทีว่าสองตัวเลขนี้คนละช่วงเวลากัน ไม่ใช่ขัดแย้งกัน — จุดเรียกใช้ (health/page.tsx)
// ส่ง `ในช่วง ${trendPeriodDays} วันที่ผ่านมา` เข้ามา
// v54: ฟีดแบ็ก "การ์ด Insight อ่านเหมือนรายงาน — อยากได้ ↑3.7% · 90 วัน แบบ chip สั้นๆ แยกจากคำแนะนำ" —
// เพิ่ม periodShortLabel (เช่น "90 วัน" ไม่มี "ในช่วง...ที่ผ่านมา") มาประกอบ deltaLabel/actionLabel แยกจาก
// detail (detail ยังคงข้อความเต็มไว้เหมือนเดิมเผื่อจุดใช้อื่น) — InsightCard จะเลือกโชว์ deltaLabel/
// actionLabel แทน detail อัตโนมัติถ้ามีค่า (ดูคอมเมนต์ที่ Insight interface ใน dashboardStats.ts)
// สร้าง insight จากการเปลี่ยนแปลงของค่าล่าสุดเทียบกับค่าแรกในช่วงที่เลือกดู (7/30/90 วัน)
// ใช้เกณฑ์ %เปลี่ยนแปลงขั้นต่ำกันสัญญาณรบกวนจากความคลาดเคลื่อนเล็กน้อยของเครื่องชั่ง
export function computeHealthTrendInsights(params: {
  weight?: { first: number; last: number }
  bodyFatPct?: { first: number; last: number }
  skeletalMuscle?: { first: number; last: number }
  bodyFatKg?: { first: number; last: number }
  muscleMass?: { first: number; last: number }
  bodyAge?: { first: number; last: number }
  minPct?: number
  periodLabel: string
  periodShortLabel: string
  // v55: ฟีดแบ็ก "การ์ด Insight 'น้ำหนักเปลี่ยนแปลง' ติด tier ทำได้ดี (เขียว) เสมอไม่ว่าน้ำหนักขึ้นหรือลง —
  // ขัดกับหลัก 'น้ำหนักเป็น Neutral เสมอ' ที่ตกลงกันไว้หลายรอบก่อนหน้า" — เดิม trend-weight ใช้ kind: 'positive'
  // ตายตัว (มาจากตอนที่ insight ระบบยังไม่มี concept เป้าหมายเทียบทิศทาง) ผู้ใช้ยืนยันให้เทียบกับทิศทางเป้าหมาย
  // เหมือนที่ override ไปแล้วกับลูกศร min/max บนกราฟ (OverviewTrendChart) — ไม่ระบุ (ไม่มีเป้าหมายตั้งไว้) =
  // ไม่รู้ทิศทางที่ดีจริง ให้ tier เป็น 'watch' (ควรติดตาม เฉยๆ) แทนที่จะเดาว่า "ทำได้ดี"
  weightDirection?: Direction
  // v60: ฟีดแบ็ก "Top Summary (↓0.4% ไขมัน จากสัปดาห์ที่แล้ว) กับ Body Insights (เพิ่มขึ้น 3.7% · 90 วัน)
  // ขัดกันในสายตา ทั้งที่ถูกทั้งคู่คนละช่วงเวลา — อยากให้บอกว่าแนวโน้มล่าสุดกำลังดีขึ้น/แย่ลงกว่าที่การ์ดบอก"
  // — เดลต้าล่าสุด (latest vs เอนทรีก่อนหน้า, เดียวกับที่ Top Summary ใช้) ส่งเข้ามาเทียบทิศทางกับเดลต้าระยะยาว
  // ของ insight นี้เท่านั้น (ไม่คำนวณ insight ใหม่จากมัน) มีค่าก็ใช้ ไม่มีก็ข้าม ไม่ fabricate
  recentBodyFatDelta?: number | null
  recentPeriodLabel?: string
  // v75: ฟีดแบ็ก "↑ 2.6% ของน้ำหนัก — ถ้าอยากให้ User สนใจน้ำหนักจริงมากกว่า percentage ควรโชว์ ↑ 1.7 kg
  // แทน เพราะน้ำหนักเป็น kg อยู่แล้วทุกจุดอื่นในหน้านี้" — หน่วยแสดงผลของน้ำหนัก (kg/lb ตาม toDisplay ที่จุด
  // เรียกใช้แปลงมาให้แล้วใน weight.first/last) ไม่ระบุ = 'kg' (พฤติกรรมเดิม ไม่กระทบจุดเรียกใช้ที่ไม่ได้ส่งมา)
  weightUnit?: string
}): Insight[] {
  const minPct = params.minPct ?? 1.5
  const periodLabel = params.periodLabel
  const periodShort = params.periodShortLabel
  const insights: Insight[] = []
  const recentBodyFat = params.recentBodyFatDelta ?? null
  const recentPeriod = params.recentPeriodLabel ?? 'ล่าสุด'
  const weightUnit = params.weightUnit ?? 'kg'

  const pctChange = (first: number, last: number) => (first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0)
  // ฟีดแบ็ก "แยก 3 ระดับ ไม่ใช่แค่ positive/warning" — warning ที่เปลี่ยนแปลงมาก (>= 2 เท่าของเกณฑ์ขั้นต่ำ
  // ที่ใช้ตัดสินว่าจะสร้าง insight นี้ขึ้นมาเลยหรือไม่) ถือเป็น "ต้องแก้" (attention) ส่วนที่เพิ่งข้ามเกณฑ์
  // ขั้นต่ำมาไม่มาก ถือเป็น "ควรรู้/ติดตาม" (watch) — positive ทุกอันเป็น "ทำได้ดี" (good) เสมอ
  const tierFor = (kind: 'positive' | 'warning', pct: number): 'attention' | 'watch' | 'good' =>
    kind === 'positive' ? 'good' : Math.abs(pct) >= minPct * 2 ? 'attention' : 'watch'

  if (params.bodyFatPct) {
    const pct = pctChange(params.bodyFatPct.first, params.bodyFatPct.last)
    // v74: ฟีดแบ็ก "3.7% กับ 0.4 จุดเปอร์เซ็นต์ (Top Summary) ต่างกันยังไง? — Body Fat เป็น percentage อยู่แล้ว
    // ควรแสดงเป็นจุดเปอร์เซ็นต์" — pct (relative % change ของค่า % เอง) ยังใช้ตัดสิน trigger/tier เหมือนเดิม
    // (ไม่แตะ threshold system ที่ minPct ใช้ร่วมกับตัวชี้วัดอื่น) แต่สิ่งที่ "แสดง" ให้ผู้ใช้เห็นเปลี่ยนเป็น
    // ส่วนต่างจริง (point delta, last-first) ในหน่วยจุดเปอร์เซ็นต์ ให้ตรงกับทุกจุดอื่นของหน้านี้ที่ใช้
    // จุดเปอร์เซ็นต์กับ body_fat_pct เสมอ (Top Summary/Goal/Key Metrics) ไม่ใช่ % สัมพัทธ์ที่สับสน
    const pointDelta = params.bodyFatPct.last - params.bodyFatPct.first
    // ทิศทางล่าสุดสวนทางทิศทางระยะยาวจริงๆ เท่านั้นถึงจะพูดถึง (เกณฑ์ 0.1 จุด กันสัญญาณรบกวนเล็กน้อยจาก
    // ความคลาดเคลื่อนของเครื่องชั่ง เหมือน minPct ที่ใช้ตัดสิน insight หลักอยู่แล้ว)
    const recentConflictsDown = recentBodyFat !== null && recentBodyFat >= 0.1
    const recentConflictsUp = recentBodyFat !== null && recentBodyFat <= -0.1
    if (pct <= -minPct) {
      insights.push({
        id: 'trend-bodyfat-down',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '🔥',
        title: 'แนวโน้มดีขึ้น',
        detail: `ไขมันในร่างกายลดลง ${Math.abs(pointDelta).toFixed(1)} จุดเปอร์เซ็นต์ ${periodLabel}`,
        deltaLabel: `↓ ${Math.abs(pointDelta).toFixed(1)} จุดเปอร์เซ็นต์ · ${periodShort}`,
        // v66: ฟีดแบ็ก "คำว่า 'แต่' ทำให้เหมือนระบบกำลังแก้ตัวให้ข้อมูลตัวเอง" — เดิม "แต่{period}เพิ่มขึ้น..."
        // v75: ฟีดแบ็ก "คำว่า 'แต่' สำคัญมาก มันทำหน้าที่เป็น bridge" — เติม "แต่" กลับมา
        // v76: ฟีดแบ็ก "ตอนนี้ title เปลี่ยนไปพูดถึง 'ระยะยาว' ตรงๆ แล้ว (ดู trend-bodyfat-up) ไม่ต้องพึ่ง 'แต่'
        // เป็น bridge อีกต่อไป — เอาออก ให้สั้นตรงประเด็นกว่า" — เอา "แต่" ออกอีกครั้ง (รอบนี้เพราะ title ทำหน้าที่
        // แยก timeframe ให้แล้วตั้งแต่ต้นประโยค ไม่ใช่กลับไปกังวลเรื่อง "ฟังดูเหมือนแก้ตัว" แบบ v66)
        // v77: ฟีดแบ็ก "Card ยาวกว่าใบอื่น — แยก label กับตัวเลขเป็น mini-block เหมือน deltaLabel หลัก" — เปลี่ยน
        // จาก recentNote ประโยคเดียวเป็น recentTrendLabel/Value คู่กัน (ดู InsightCard.tsx)
        recentTrendLabel: recentConflictsDown ? 'แนวโน้มล่าสุดแย่ลง' : undefined,
        recentTrendValue: recentConflictsDown ? `↑ ${recentBodyFat!.toFixed(1)} จุดเปอร์เซ็นต์ ${recentPeriod}` : undefined,
        recentTrendGood: recentConflictsDown ? false : undefined,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyfat-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        // v76: ฟีดแบ็ก "ผู้ใช้เห็น 🔴 แล้วตามด้วย 'ดีขึ้น' รู้สึกขัดกัน — title ควรบอกกรอบเวลาตรงๆ" — เปลี่ยนจาก
        // "ไขมันในร่างกายเพิ่มขึ้น" (ไม่บอกกรอบเวลา) เป็น "...สูงขึ้นในระยะยาว" ให้ผู้ใช้รู้ทันทีว่า tier 🔴 นี้
        // ตัดสินจาก 90 วัน ส่วน recentTrend ด้านล่างเป็นแนวโน้มล่าสุด (7 วัน) คนละกรอบเวลากัน ไม่ใช่ระบบขัดแย้งกัน
        title: 'ไขมันในร่างกายสูงขึ้นในระยะยาว',
        detail: `เพิ่มขึ้น ${pointDelta.toFixed(1)} จุดเปอร์เซ็นต์ ${periodLabel} ลองทบทวนอาหารและการฝึก`,
        deltaLabel: `↑ ${pointDelta.toFixed(1)} จุดเปอร์เซ็นต์ · ${periodShort}`,
        // v79: ฟีดแบ็ก "Insight ควรบอกว่าเกิดอะไรขึ้น ส่วน Recommendation บอกว่าควรทำอะไร — 'ลองทบทวนอาหารและ
        // การฝึก' ซ้ำกับคำแนะนำ 'เพิ่มการใช้พลังงาน' ด้านล่างอยู่แล้ว ไม่จำเป็นต้องพูดซ้ำใน Insight" — เอา
        // actionLabel ออก (ยังมีลิงก์ "ดูคำแนะนำ →" อยู่ — ดู InsightCard.tsx ที่แก้เงื่อนไขไม่ให้ผูกกับ
        // actionLabel อีกต่อไป เปลี่ยนไปผูกกับ kind === 'warning' แทน)
        // v76: เอา "แต่" ออก — title พูดกรอบเวลาแทนแล้ว
        // v77: recentTrendLabel/Value คู่กัน แทน recentNote ประโยคเดียว (ดูคอมเมนต์เดียวกันด้านบน)
        recentTrendLabel: recentConflictsUp ? 'แนวโน้มล่าสุดดีขึ้น' : undefined,
        recentTrendValue: recentConflictsUp ? `↓ ${Math.abs(recentBodyFat!).toFixed(1)} จุดเปอร์เซ็นต์ ${recentPeriod}` : undefined,
        recentTrendGood: recentConflictsUp ? true : undefined,
      })
    }
  }

  if (params.skeletalMuscle) {
    const pct = pctChange(params.skeletalMuscle.first, params.skeletalMuscle.last)
    if (pct >= minPct) {
      insights.push({
        id: 'trend-muscle-up',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '💪',
        title: 'กล้ามเนื้อเพิ่มขึ้น',
        detail: `กล้ามเนื้อโครงร่างเพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} รักษาแนวทางปัจจุบันต่อเนื่อง`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'รักษาแนวทางปัจจุบันต่อเนื่อง',
      })
    } else if (pct <= -minPct) {
      insights.push({
        id: 'trend-muscle-down',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'กล้ามเนื้อลดลง',
        detail: `กล้ามเนื้อโครงร่างลดลง ${Math.abs(pct).toFixed(1)}% ${periodLabel} ลองเพิ่มการฝึกแรงต้าน`,
        deltaLabel: `↓ ${Math.abs(pct).toFixed(1)}% · ${periodShort}`,
        actionLabel: 'ลองเพิ่มการฝึกแรงต้าน',
      })
    }
  }

  if (params.weight) {
    const pct = pctChange(params.weight.first, params.weight.last)
    if (Math.abs(pct) >= minPct) {
      const dir = params.weightDirection ?? 'neutral'
      const isGoodDirection = dir === 'neutral' ? null : dir === 'lowerBetter' ? pct < 0 : pct > 0
      const kind: 'positive' | 'warning' = isGoodDirection === false ? 'warning' : 'positive'
      // v63: ฟีดแบ็ก "'น้ำหนักเพิ่มขึ้น ↑2.6% · 90 วัน' กับ 'น้ำหนักที่เพิ่มขึ้นมาจากมวลกล้ามเนื้อเป็นหลัก' ใต้
      // กราฟดูขัดกันเล็กน้อย ทั้งที่จริงสองอย่างสอดคล้องกัน" — เพิ่ม actionLabel เฉพาะตอนน้ำหนักเพิ่มขึ้นจริง
      // (pct > 0) และมวลกล้ามเนื้อ (skeletal หรือ mass ช่วงเวลาเดียวกัน) ก็เพิ่มขึ้นด้วยจริง ไม่เดา — ใช้
      // skeletalMuscle ก่อน (ตัวชี้วัดหลักที่ใช้เทียบในจุดอื่นของหน้านี้) ถ้าไม่มีข้อมูล fallback ไป muscleMass
      // v74: ฟีดแบ็ก "อยากให้ headline บอกตรงๆ ว่า 'แต่สัดส่วนดีขึ้น' ไม่ใช่แค่บรรทัดรอง" — ก่อนขึ้น title แบบ
      // ฟันธงว่า "สัดส่วนดีขึ้น" ต้องมั่นใจว่าไขมันไม่ได้เพิ่มด้วย ไม่ใช่แค่กล้ามเนื้อเพิ่มอย่างเดียว (เดิมเช็คแค่
      // กล้ามเนื้อ ไม่เช็คไขมันเลย ต่างจาก weightGainLooksLikeMuscle ที่การ์ดน้ำหนักใช้ ซึ่งเช็คทั้งคู่) — เพิ่ม
      // เงื่อนไขไขมันไม่เพิ่ม (bodyFatPct ก่อน ถ้าไม่มีข้อมูล fallback bodyFatKg) ให้เข้มงวดเท่ากับจุดอื่น
      const muscleUp =
        pct > 0 &&
        (params.skeletalMuscle
          ? pctChange(params.skeletalMuscle.first, params.skeletalMuscle.last) > 0
          : params.muscleMass
            ? pctChange(params.muscleMass.first, params.muscleMass.last) > 0
            : false)
      const fatNotUp = params.bodyFatPct
        ? params.bodyFatPct.last <= params.bodyFatPct.first
        : params.bodyFatKg
          ? params.bodyFatKg.last <= params.bodyFatKg.first
          : false
      const compositionImproving = muscleUp && fatNotUp
      // v75: ฟีดแบ็ก "↑ 2.6% ของน้ำหนัก อยากได้ ↑ 1.7 kg แทน เพราะน้ำหนักเป็น kg อยู่แล้วทุกจุดอื่น" — pct
      // (relative % change) ยังใช้ตัดสิน trigger/tier เหมือนเดิม แต่สิ่งที่แสดงเปลี่ยนเป็นส่วนต่างจริงหน่วย kg/lb
      const pointDelta = params.weight.last - params.weight.first
      insights.push({
        id: 'trend-weight',
        kind,
        // v68: ฟีดแบ็ก "แยก ℹ️ Tracking ออกจาก 🟡 ควรติดตาม" — น้ำหนักที่ไม่มีเป้าหมายกำกับทิศทาง (isGoodDirection
        // === null) ไม่ได้มีสัญญาณเตือนอะไรจริง แค่ยังไม่รู้ว่าทิศไหนดี ควรเป็น tier กลาง (tracking) แยกจาก
        // watch ที่สงวนไว้สำหรับกรณีที่รู้ทิศทางแล้วและกำลังไปผิดทาง
        tier: isGoodDirection === null ? 'tracking' : tierFor(kind, pct),
        icon: pct < 0 ? '📉' : '📈',
        // v67/v74/v75: title เคยเปลี่ยนเป็น "แต่สัดส่วนดีขึ้น" ตอน compositionImproving — v76: ฟีดแบ็ก
        // "ผมว่าควรเพิ่ม context กลับมาอีกนิด แต่ title เป็น 'น้ำหนักเพิ่มขึ้น' เฉยๆ พอ" — ย้อน title กลับเป็นข้อเท็จ
        // จริงล้วนๆ ("น้ำหนักเพิ่มขึ้น") แล้วย้าย claim "สัดส่วนดีขึ้น" ไปไว้ที่ actionLabel แทน (ยังใช้เงื่อนไข
        // compositionImproving เดิม ไม่เปลี่ยน — ยังต้องมั่นใจทั้งกล้ามเนื้อเพิ่ม+ไขมันไม่เพิ่มก่อนพูดแบบนี้)
        // v75: ฟีดแบ็ก "ไม่ต้องมี 'ดูคำแนะนำ' ก็ได้ เพราะไม่ได้มีปัญหาเฉพาะที่ต้องแก้" — compositionImproving เป็น
        // ข่าวดี ไม่ใช่คำเตือน ไม่ควรชวนกดไปหาคำแนะนำที่ไม่มีอยู่จริงสำหรับกรณีนี้
        // v79: ฟีดแบ็ก "ขาด context — มวลกล้ามเนื้อเพิ่มขึ้น ขณะที่มวลไขมันลดลง" ขอกลับมาอีกครั้ง แต่ตรวจข้อมูลจริง
        // แล้วพบว่าในช่วง 90 วันเดียวกันนี้ไขมันไม่ได้ลดลงจริง (compositionImproving = false เพราะ fatNotUp เป็น
        // false) — ผู้ใช้เองยืนยันไปแล้วในรอบก่อนว่าให้ใช้ข้อมูล 90 วันเดียวกัน ไม่ผสมกับแนวโน้ม 7 วันล่าสุด —
        // จุดกึ่งกลางที่ยังพูดความจริงได้: "กล้ามเนื้อเพิ่มขึ้น" เป็นจริงในช่วง 90 วันเดียวกัน (muscleUp) แม้ไขมัน
        // จะไม่ได้ลดลงพร้อมกันก็ตาม — โชว์ข้อเท็จจริงส่วนกล้ามเนื้ออย่างเดียว ไม่พูดถึงไขมันเลยถ้าไม่ใช่ fatNotUp
        // (ไม่ fabricate ว่าไขมันลดลงทั้งที่ไม่จริงในกรอบเวลาเดียวกัน)
        hideRecommendationLink: compositionImproving,
        actionLabel: compositionImproving
          ? 'แต่อัตราส่วนกล้ามเนื้อและไขมันมีแนวโน้มดีขึ้น'
          : muscleUp
            ? 'มวลกล้ามเนื้อก็เพิ่มขึ้นในช่วงเดียวกัน'
            : undefined,
        title: pct < 0 ? 'น้ำหนักลดลง' : 'น้ำหนักเพิ่มขึ้น',
        detail: `น้ำหนักเปลี่ยนแปลง ${Math.abs(pointDelta).toFixed(1)} ${weightUnit} ${periodLabel}`,
        deltaLabel: `${pct < 0 ? '↓' : '↑'} ${Math.abs(pointDelta).toFixed(1)} ${weightUnit} · ${periodShort}`,
      })
    }
  }

  if (params.muscleMass) {
    const pct = pctChange(params.muscleMass.first, params.muscleMass.last)
    if (pct >= minPct) {
      insights.push({
        id: 'trend-musclemass-up',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '💪',
        title: 'มวลกล้ามเนื้อเพิ่มขึ้น',
        detail: `มวลกล้ามเนื้อเพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} รักษาแนวทางปัจจุบันต่อเนื่อง`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'รักษาแนวทางปัจจุบันต่อเนื่อง',
      })
    } else if (pct <= -minPct) {
      insights.push({
        id: 'trend-musclemass-down',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'มวลกล้ามเนื้อลดลง',
        detail: `มวลกล้ามเนื้อลดลง ${Math.abs(pct).toFixed(1)}% ${periodLabel} ลองเพิ่มการฝึกแรงต้าน`,
        deltaLabel: `↓ ${Math.abs(pct).toFixed(1)}% · ${periodShort}`,
        actionLabel: 'ลองเพิ่มการฝึกแรงต้าน',
      })
    }
  }

  if (params.bodyAge) {
    const pct = pctChange(params.bodyAge.first, params.bodyAge.last)
    // v74: ฟีดแบ็ก "อายุร่างกาย +3.1% แปลกอยู่ — ถ้าคือ 38→39 ปี ควรแสดง ↑ 1 ปี ไม่ใช่ %" — pct (relative %
    // change) ยังใช้ตัดสิน trigger/tier เหมือนเดิม แต่สิ่งที่แสดงเปลี่ยนเป็นส่วนต่างปีจริง (ปีเป็นหน่วยที่เข้าใจ
    // ทันทีอยู่แล้ว ไม่ต้องแปลงเป็น % ให้ตีความยากขึ้น)
    const yearsDelta = params.bodyAge.last - params.bodyAge.first
    if (pct <= -minPct) {
      insights.push({
        id: 'trend-bodyage-down',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '❤️',
        title: 'อายุร่างกายดีขึ้น',
        detail: `อายุร่างกายลดลง ${Math.abs(yearsDelta).toFixed(1)} ปี ${periodLabel}`,
        deltaLabel: `↓ ${Math.abs(yearsDelta).toFixed(1)} ปี · ${periodShort}`,
        // v73: ฟีดแบ็ก "อายุร่างกาย +3.1% ไม่ชัดว่าคืออะไร" — ไม่มีจุดไหนในหน้านี้อธิบายค่านี้จริงๆ อยู่แล้ว
        // (กลไก ⓘ ที่ทำไว้ตั้งแต่ v7 ไม่มี IconStatCard ไหนใช้จริง) เพิ่มคำอธิบายสั้นๆ ตรงนี้แทน
        noteText: 'อายุร่างกายเป็นค่าประเมินจากองค์ประกอบร่างกาย ไม่ใช่อายุจริง',
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyage-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'อายุร่างกายเพิ่มขึ้น',
        detail: `อายุร่างกายเพิ่มขึ้น ${yearsDelta.toFixed(1)} ปี ${periodLabel} ลองทบทวนการนอนและการฝึก`,
        deltaLabel: `↑ ${yearsDelta.toFixed(1)} ปี · ${periodShort}`,
        actionLabel: 'ลองทบทวนการนอนและการฝึก',
        noteText: 'อายุร่างกายเป็นค่าประเมินจากองค์ประกอบร่างกาย ไม่ใช่อายุจริง',
      })
    }
  }

  // ฟีดแบ็ก "เรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี" — เดิม slice(0,4) ตามลำดับที่ตรวจพบ (bodyFat/muscle/
  // weight/bodyAge คงที่) ตอนนี้เรียงตาม tier ก่อนตัดเหลือ 4 ให้การ์ดที่สำคัญที่สุด (attention) ไม่มีทาง
  // ถูกตัดออกเพราะดันไปอยู่ท้ายลำดับที่ตรวจพบ
  return insights.sort((a, b) => TIER_ORDER[a.tier ?? 'good'] - TIER_ORDER[b.tier ?? 'good']).slice(0, 4)
}
