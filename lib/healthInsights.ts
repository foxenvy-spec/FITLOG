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
}): Insight[] {
  const minPct = params.minPct ?? 1.5
  const periodLabel = params.periodLabel
  const periodShort = params.periodShortLabel
  const insights: Insight[] = []
  const recentBodyFat = params.recentBodyFatDelta ?? null
  const recentPeriod = params.recentPeriodLabel ?? 'ล่าสุด'

  const pctChange = (first: number, last: number) => (first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0)
  // ฟีดแบ็ก "แยก 3 ระดับ ไม่ใช่แค่ positive/warning" — warning ที่เปลี่ยนแปลงมาก (>= 2 เท่าของเกณฑ์ขั้นต่ำ
  // ที่ใช้ตัดสินว่าจะสร้าง insight นี้ขึ้นมาเลยหรือไม่) ถือเป็น "ต้องแก้" (attention) ส่วนที่เพิ่งข้ามเกณฑ์
  // ขั้นต่ำมาไม่มาก ถือเป็น "ควรรู้/ติดตาม" (watch) — positive ทุกอันเป็น "ทำได้ดี" (good) เสมอ
  const tierFor = (kind: 'positive' | 'warning', pct: number): 'attention' | 'watch' | 'good' =>
    kind === 'positive' ? 'good' : Math.abs(pct) >= minPct * 2 ? 'attention' : 'watch'

  if (params.bodyFatPct) {
    const pct = pctChange(params.bodyFatPct.first, params.bodyFatPct.last)
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
        detail: `ไขมันในร่างกายลดลง ${Math.abs(pct).toFixed(1)}% ${periodLabel}`,
        deltaLabel: `↓ ${Math.abs(pct).toFixed(1)}% · ${periodShort}`,
        // v66: ฟีดแบ็ก "คำว่า 'แต่' ทำให้เหมือนระบบกำลังแก้ตัวให้ข้อมูลตัวเอง" — เดิม "แต่{period}เพิ่มขึ้น..."
        // ฟังดูเหมือนขัดแย้งกับ insight หลักด้านบน (แนวโน้มดีขึ้น) ทั้งที่จริงเป็นคนละช่วงเวลากัน — เปลี่ยนเป็น
        // กรอบ "ระยะยาว vs ระยะสั้น" ตรงๆ (แนวโน้มระยะสั้นแย่ลง — {period}เพิ่มขึ้น...) ให้อ่านแล้วเข้าใจทันทีว่า
        // สองตัวเลขนี้คนละกรอบเวลา ไม่ใช่ระบบขัดแย้งกันเอง
        recentNote: recentConflictsDown ? `แนวโน้มระยะสั้นแย่ลง — ${recentPeriod}เพิ่มขึ้น ${recentBodyFat!.toFixed(1)} จุดเปอร์เซ็นต์` : undefined,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyfat-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'ไขมันในร่างกายเพิ่มขึ้น',
        detail: `เพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} ลองทบทวนอาหารและการฝึก`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'ลองทบทวนอาหารและการฝึก',
        recentNote: recentConflictsUp ? `แนวโน้มระยะสั้นดีขึ้น — ${recentPeriod}ลดลง ${Math.abs(recentBodyFat!).toFixed(1)} จุดเปอร์เซ็นต์` : undefined,
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
        detail: `กล้ามเนื้อโครงร่างเพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'รักษาโปรแกรมแบบนี้ต่อเนื่อง',
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
      const muscleAlsoUp =
        pct > 0 &&
        (params.skeletalMuscle
          ? pctChange(params.skeletalMuscle.first, params.skeletalMuscle.last) > 0
          : params.muscleMass
            ? pctChange(params.muscleMass.first, params.muscleMass.last) > 0
            : false)
      insights.push({
        id: 'trend-weight',
        kind,
        // v68: ฟีดแบ็ก "แยก ℹ️ Tracking ออกจาก 🟡 ควรติดตาม" — น้ำหนักที่ไม่มีเป้าหมายกำกับทิศทาง (isGoodDirection
        // === null) ไม่ได้มีสัญญาณเตือนอะไรจริง แค่ยังไม่รู้ว่าทิศไหนดี ควรเป็น tier กลาง (tracking) แยกจาก
        // watch ที่สงวนไว้สำหรับกรณีที่รู้ทิศทางแล้วและกำลังไปผิดทาง
        tier: isGoodDirection === null ? 'tracking' : tierFor(kind, pct),
        icon: pct < 0 ? '📉' : '📈',
        // v67: ฟีดแบ็ก "'สอดคล้องกับมวลกล้ามเนื้อที่เพิ่มขึ้น' อ่านแปลกๆ กับ tier 🟡 ควรติดตาม — เป็นวลีบอก
        // ความสัมพันธ์ระหว่างตัวเลข ไม่ใช่คำแนะนำ" — เปลี่ยนเป็นกรอบคำแนะนำที่ตรงกับ tier ควรติดตาม (ติดตาม
        // แนวโน้มต่อเนื่อง) แล้วต่อท้ายข้อเท็จจริงเดิม (มวลกล้ามเนื้อก็เพิ่มขึ้นเช่นกัน) เงื่อนไข muscleAlsoUp เดิมไม่เปลี่ยน
        actionLabel: muscleAlsoUp ? 'ติดตามแนวโน้มต่อเนื่อง โดยมวลกล้ามเนื้อก็เพิ่มขึ้นเช่นกัน' : undefined,
        title: pct < 0 ? 'น้ำหนักลดลง' : 'น้ำหนักเพิ่มขึ้น',
        detail: `น้ำหนักเปลี่ยนแปลง ${pct.toFixed(1)}% ${periodLabel}`,
        deltaLabel: `${pct < 0 ? '↓' : '↑'} ${Math.abs(pct).toFixed(1)}% · ${periodShort}`,
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
        detail: `มวลกล้ามเนื้อเพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'รักษาโปรแกรมแบบนี้ต่อเนื่อง',
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
    if (pct <= -minPct) {
      insights.push({
        id: 'trend-bodyage-down',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '❤️',
        title: 'อายุร่างกายดีขึ้น',
        detail: `อายุร่างกายลดลง ${Math.abs(pct).toFixed(1)}% ${periodLabel}`,
        deltaLabel: `↓ ${Math.abs(pct).toFixed(1)}% · ${periodShort}`,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyage-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'อายุร่างกายเพิ่มขึ้น',
        detail: `อายุร่างกายเพิ่มขึ้น ${pct.toFixed(1)}% ${periodLabel} ลองทบทวนการนอนและการฝึก`,
        deltaLabel: `↑ ${pct.toFixed(1)}% · ${periodShort}`,
        actionLabel: 'ลองทบทวนการนอนและการฝึก',
      })
    }
  }

  // ฟีดแบ็ก "เรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี" — เดิม slice(0,4) ตามลำดับที่ตรวจพบ (bodyFat/muscle/
  // weight/bodyAge คงที่) ตอนนี้เรียงตาม tier ก่อนตัดเหลือ 4 ให้การ์ดที่สำคัญที่สุด (attention) ไม่มีทาง
  // ถูกตัดออกเพราะดันไปอยู่ท้ายลำดับที่ตรวจพบ
  return insights.sort((a, b) => TIER_ORDER[a.tier ?? 'good'] - TIER_ORDER[b.tier ?? 'good']).slice(0, 4)
}
