'use client'

import type { ReactNode } from 'react'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { COLORS, withAlpha } from '@/lib/theme'
import { recoveryTier } from '@/lib/dashboardStats'

// ใหม่สำหรับ Version 5 rebuild — แถว 3 การ์ดเล็ก Recovery/Body Fat/Weight แทนกริด 2x2 Body Overview
// เดิม (BodyMetricsRow.tsx, มี 4 การ์ด: น้ำหนัก/ไขมันในร่างกาย/มวลกล้ามเนื้อ/มวลไขมัน — mockup มีแค่ 3
// การ์ดตามที่ "Version 5" แสดงเป๊ะ ไม่ใส่มวลกล้ามเนื้อ/มวลไขมันเพิ่มเพราะไม่มีใน mockup)
//
// Recovery ใช้ recoveryTier() ตัวเดียวกับที่ AI Coach/Recovery card อื่นทั้งแอปใช้ (ไม่คิดเกณฑ์สี/ป้าย
// ใหม่แยกต่างหาก — เคยมีบั๊กจริงจากการมีหลาย tier function กระจายคนละไฟล์คำนวณจากข้อมูลเดียวกันแล้วให้
// ผลไม่ตรงกัน ดู comment ที่ recoveryVerdictEmoji ใน lib/dashboardStats.ts)
//
// v2: ฟีดแบ็ก "ยังไม่เหมือนเลยทั้งสีกรอบแสงเงา" — ไอคอน emoji (💚🔻⚖️) เดิมมีสีของตัวเองติดมากับฟอนต์/
// แพลตฟอร์ม (แดง/เหลือง/เทาเงินตามจริงของแต่ละอีโมจิ) ไปกันสีพื้นหลังวงที่ตั้งใจให้ตรงกับ tier/status —
// เปลี่ยนเป็น SVG เส้นเอง (stroke=currentColor ควบคุมสีได้เต็มที่)
//
// v3: "Mobile_app_design_brief_1.zip" (6a, บรรทัด 74-92 ของ .dc.html) — สเปกละเอียดระบุ icon container
// เป็นวงกลม (border-radius:50%) 26px ไม่ใช่สี่เหลี่ยมมุมโค้งแบบที่ประมาณไว้ตอนดูจากภาพ mockup เท่านั้น
// (v2 ด้านบน) กลับไปใช้ rounded-full ตามสเปกที่ชัดเจนกว่า — พื้นหลังการ์ดเปลี่ยนจาก gradient เป็นสีทึบ
// #16191D ล้วน + hairline แบบ box-shadow แทน border ตรงตาม token ใหม่ — สีทิ้นท์ไอคอน Body Fat ยังใช้
// COLORS.rust เดิม (ตรงกับ hex #C1503A ที่ brief เรียกว่า "coral" — ชื่อคนละคำ แต่ hex เดียวกันเป๊ะ ไม่ต้อง
// เปลี่ยน) ส่วน Weight เปลี่ยนจาก COLORS.amber -> COLORS.steel (#6C8CA8 ตรงกับ rgba(108,140,168) ในสเปก
// เป๊ะ — amber เดิมเป็นการเดาผิดตอนไม่มีสเปกละเอียด) Recovery ยังคงใช้ recoveryTier() แบบ dynamic ต่อไป
// (ไม่ใช่ moss คงที่แบบ mockup) เพราะให้ข้อมูลที่เป็นประโยชน์กว่า/สอดคล้องกับจุดอื่นในแอปที่ใช้ tier เดียวกัน
//
// v4: ฟีดแบ็ก "ตรงการ์ด ฟื้นตัว น้ำหนัก ไขมัน ใช้เป็นภาษาอังกฤษ" — ป้ายหัวการ์ดทั้ง 3 เปลี่ยนจากไทย
// (ฟื้นตัว/ไขมัน/น้ำหนัก) เป็นอังกฤษ (Recovery/Body Fat/Weight) ตรงกับ brief เป๊ะ — sublabel ของ Recovery
// เปลี่ยนตามไปด้วย (recovery.labelEn แทน labelTh, มีอยู่แล้วใน lib/dashboardStats.ts ไม่ต้องเพิ่มฟิลด์ใหม่)
// ให้ทั้งการ์ดพูดภาษาเดียวกันตลอด ไม่ผสมไทย/อังกฤษในการ์ดเดียว

interface MetricValue {
  value: number | null
  delta: number | null
  isGood: boolean | null
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.8.7 4.7 2.2l1.8 3 1.8-3C14.7 4.7 16.5 3.7 18.5 4c3.5.5 5 4 3.5 7.2-2.5 4.7-10 9.3-10 9.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrendDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6l7 7 4-4 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 10v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ScaleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v18M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 7l-2.5 5a2.5 2.5 0 0 0 5 0L4 7ZM20 7l-2.5 5a2.5 2.5 0 0 0 5 0L20 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function MiniStatCard({
  icon,
  iconColor,
  label,
  value,
  sublabel,
  sublabelColor,
}: {
  icon: ReactNode
  iconColor: string
  label: string
  value: string
  sublabel: string
  sublabelColor: string
}) {
  return (
    <div
      className="px-3 py-2.5 flex flex-col justify-between"
      style={{
        height: dashboardSpec.miniStatCard.height,
        borderRadius: dashboardSpec.miniStatCard.borderRadius,
        background: '#16191D',
        boxShadow: '0 0 0 1px rgba(255,255,255,.05)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="rounded-full flex items-center justify-center shrink-0"
          style={{ width: 26, height: 26, backgroundColor: withAlpha(iconColor, '2E'), color: iconColor }}
          aria-hidden="true"
        >
          {icon}
        </span>
        {/* min-w-0 จำเป็น — flex item ปกติไม่ยอมหดเกินความกว้างเนื้อหาตัวเอง (min-width:auto ดีฟอลต์)
            ทำให้ truncate ไม่ทำงานจริง (แถวทั้งแถวล้นการ์ดแทน) ต้องใส่ min-w-0 ให้ยอมหดก่อน ellipsis
            ถึงจะตัดคำที่ความกว้างจริงของคอลัมน์ (~58px) แทนที่จะกินพื้นที่เกินจนดูเหมือนตัดสั้นผิดปกติ */}
        <p className="text-[11px] text-muted truncate min-w-0 flex-1">{label}</p>
      </div>
      <div>
        <p className="font-display font-bold text-ink leading-none" style={{ fontSize: 17 }}>
          {value}
        </p>
        <p className="text-[11px] mt-1 leading-none" style={{ color: sublabelColor }}>
          {sublabel}
        </p>
      </div>
    </div>
  )
}

function deltaText(delta: number | null, digits = 1): string {
  if (delta == null) return '–'
  const rounded = Math.round(delta * 10 ** digits) / 10 ** digits
  return `${rounded > 0 ? '↑' : rounded < 0 ? '↓' : ''} ${Math.abs(rounded)}`
}

// isGood=null (ไม่มีข้อมูลเทียบ/delta เป็น 0) ใช้สีเทากลาง ไม่ใช่เขียว/แดง เพราะยังไม่รู้ทิศทางจริง
function deltaColor(isGood: boolean | null): string {
  if (isGood === true) return COLORS.moss
  if (isGood === false) return COLORS.rust
  return '#9498A0'
}

export default function TriStatRow({
  recoveryPct,
  bodyFat,
  weight,
  weightUnit,
}: {
  recoveryPct: number | null
  bodyFat: MetricValue
  weight: MetricValue
  weightUnit: string
}) {
  const recovery = recoveryPct != null ? recoveryTier(recoveryPct) : null
  return (
    <div className="grid grid-cols-3 animate-rise" style={{ gap: dashboardSpec.miniStatCard.gridGap }}>
      <MiniStatCard
        icon={<HeartIcon />}
        iconColor={recovery?.color ?? '#9498A0'}
        label="Recovery"
        value={recoveryPct != null ? `${recoveryPct}%` : '–'}
        sublabel={recovery?.labelEn ?? 'No data'}
        sublabelColor={recovery?.color ?? '#9498A0'}
      />
      <MiniStatCard
        icon={<TrendDownIcon />}
        iconColor={COLORS.rust}
        label="Body Fat"
        value={bodyFat.value != null ? `${bodyFat.value.toFixed(1)}%` : '–'}
        sublabel={deltaText(bodyFat.delta)}
        sublabelColor={deltaColor(bodyFat.isGood)}
      />
      <MiniStatCard
        icon={<ScaleIcon />}
        iconColor={COLORS.steel}
        label="Weight"
        value={weight.value != null ? `${weight.value.toFixed(1)}${weightUnit}` : '–'}
        sublabel={deltaText(weight.delta)}
        sublabelColor={deltaColor(weight.isGood)}
      />
    </div>
  )
}
