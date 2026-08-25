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
const TIER_ORDER: Record<'attention' | 'watch' | 'good', number> = { attention: 0, watch: 1, good: 2 }

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
}): Insight[] {
  const minPct = params.minPct ?? 1.5
  const insights: Insight[] = []

  const pctChange = (first: number, last: number) => (first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0)
  // ฟีดแบ็ก "แยก 3 ระดับ ไม่ใช่แค่ positive/warning" — warning ที่เปลี่ยนแปลงมาก (>= 2 เท่าของเกณฑ์ขั้นต่ำ
  // ที่ใช้ตัดสินว่าจะสร้าง insight นี้ขึ้นมาเลยหรือไม่) ถือเป็น "ต้องแก้" (attention) ส่วนที่เพิ่งข้ามเกณฑ์
  // ขั้นต่ำมาไม่มาก ถือเป็น "ควรรู้/ติดตาม" (watch) — positive ทุกอันเป็น "ทำได้ดี" (good) เสมอ
  const tierFor = (kind: 'positive' | 'warning', pct: number): 'attention' | 'watch' | 'good' =>
    kind === 'positive' ? 'good' : Math.abs(pct) >= minPct * 2 ? 'attention' : 'watch'

  if (params.bodyFatPct) {
    const pct = pctChange(params.bodyFatPct.first, params.bodyFatPct.last)
    if (pct <= -minPct) {
      insights.push({
        id: 'trend-bodyfat-down',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: '🔥',
        title: 'แนวโน้มดีขึ้น',
        detail: `ไขมันในร่างกายลดลง ${Math.abs(pct).toFixed(1)}% จากช่วงที่แล้ว`,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyfat-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'ไขมันในร่างกายเพิ่มขึ้น',
        detail: `เพิ่มขึ้น ${pct.toFixed(1)}% จากช่วงที่แล้ว ลองทบทวนอาหารและการฝึก`,
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
        detail: `กล้ามเนื้อโครงร่างเพิ่มขึ้น ${pct.toFixed(1)}% รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
      })
    } else if (pct <= -minPct) {
      insights.push({
        id: 'trend-muscle-down',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'กล้ามเนื้อลดลง',
        detail: `กล้ามเนื้อโครงร่างลดลง ${Math.abs(pct).toFixed(1)}% ลองเพิ่มการฝึกแรงต้าน`,
      })
    }
  }

  if (params.weight) {
    const pct = pctChange(params.weight.first, params.weight.last)
    if (Math.abs(pct) >= minPct) {
      insights.push({
        id: 'trend-weight',
        kind: 'positive',
        tier: tierFor('positive', pct),
        icon: pct < 0 ? '📉' : '📈',
        title: pct < 0 ? 'น้ำหนักลดลง' : 'น้ำหนักเพิ่มขึ้น',
        detail: `น้ำหนักเปลี่ยนแปลง ${pct.toFixed(1)}% จากช่วงที่แล้ว`,
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
        detail: `มวลกล้ามเนื้อเพิ่มขึ้น ${pct.toFixed(1)}% รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
      })
    } else if (pct <= -minPct) {
      insights.push({
        id: 'trend-musclemass-down',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'มวลกล้ามเนื้อลดลง',
        detail: `มวลกล้ามเนื้อลดลง ${Math.abs(pct).toFixed(1)}% ลองเพิ่มการฝึกแรงต้าน`,
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
        detail: `อายุร่างกายลดลง ${Math.abs(pct).toFixed(1)}% จากช่วงที่แล้ว`,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyage-up',
        kind: 'warning',
        tier: tierFor('warning', pct),
        icon: '⚠️',
        title: 'อายุร่างกายเพิ่มขึ้น',
        detail: `อายุร่างกายเพิ่มขึ้น ${pct.toFixed(1)}% จากช่วงที่แล้ว ลองทบทวนการนอนและการฝึก`,
      })
    }
  }

  // ฟีดแบ็ก "เรียงจาก ต้องแก้ → ควรรู้ → ทำได้ดี" — เดิม slice(0,4) ตามลำดับที่ตรวจพบ (bodyFat/muscle/
  // weight/bodyAge คงที่) ตอนนี้เรียงตาม tier ก่อนตัดเหลือ 4 ให้การ์ดที่สำคัญที่สุด (attention) ไม่มีทาง
  // ถูกตัดออกเพราะดันไปอยู่ท้ายลำดับที่ตรวจพบ
  return insights.sort((a, b) => TIER_ORDER[a.tier ?? 'good'] - TIER_ORDER[b.tier ?? 'good']).slice(0, 4)
}
