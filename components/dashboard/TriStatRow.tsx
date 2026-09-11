'use client'

import type { ReactNode } from 'react'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { COLORS, withAlpha } from '@/lib/theme'
import { recoveryTier } from '@/lib/dashboardStats'
import { METRIC_ICON_IMAGES } from '@/components/MetricCard'

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

// ฟีดแบ็ก "Recovery/Body Fat/Weight มีไอคอนอยู่แล้วลองเอามาใช้ครับ" — เดิมวาด SVG เส้นเองใหม่ 3 อัน
// (HeartIcon/TrendDownIcon/ScaleIcon) ทั้งที่แอปมีชุดไอคอนจริงอยู่แล้ว ("FITLOG – Metric Icons", PNG ที่
// /public/icons/*.png) ใช้ซ้ำอยู่แล้วทั้งหน้า Health (health/page.tsx: STAT_ICON_IMAGES) และการ์ดสรุป
// Dashboard เดสก์ท็อป (MetricCard.tsx: METRIC_ICON_IMAGES, export ไว้แล้ว import ตรงๆ ได้เลย) — ไอคอนชุด
// นี้เป็น PNG สีเดียวล้วนออกแบบมาให้ใช้เป็น CSS mask (ระบายสีทับได้เต็มที่ผ่าน mask-image เหมือนที่
// MetricCard.tsx ทำอยู่แล้ว) จึงเข้ากับ container สีทิ้นท์ตามสถานะ/tier ของการ์ดนี้ได้พอดี ไม่ต้องมีพื้นหลัง
// วงกลมของตัวเองแยกแบบ health/page.tsx (ซึ่งใช้กับการ์ดพื้นผิว Dark Titanium คนละสไตล์กับการ์ดเรียบแบนนี้)
// Body Fat ได้ไอคอน body-fat.png ตัวจริง (เดิมใช้ TrendDownIcon ลูกศรทั่วไป ไม่ได้สื่อ "ไขมัน" เจาะจง) —
// Recovery ไม่มีไอคอนในชุด "Metric" (ชุดนั้นมีแต่ตัวชี้วัดร่างกาย ไม่มี Recovery) แต่มี heart-rate.png อยู่ใน
// ชุดเดียวกัน (คอมเมนต์ที่ MetricCard.tsx/health/page.tsx ระบุว่า "เตรียมไว้ใช้ในหน้าอื่นต่อได้เลย" — ยังไม่
// เคยถูกใช้ที่ไหนมาก่อน) ใช้ตัวนั้นแทน เพราะ heart rate เป็นสัญญาณที่ใกล้เคียง "ความพร้อม/ฟื้นตัว" ที่สุดในชุด
const RECOVERY_ICON_SRC = '/icons/heart-rate.png'

function MaskIcon({ src, color, size = 14 }: { src: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
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
        icon={<MaskIcon src={RECOVERY_ICON_SRC} color={recovery?.color ?? '#9498A0'} />}
        iconColor={recovery?.color ?? '#9498A0'}
        label="Recovery"
        value={recoveryPct != null ? `${recoveryPct}%` : '–'}
        sublabel={recovery?.labelEn ?? 'No data'}
        sublabelColor={recovery?.color ?? '#9498A0'}
      />
      <MiniStatCard
        icon={<MaskIcon src={METRIC_ICON_IMAGES.bodyFat} color={COLORS.rust} />}
        iconColor={COLORS.rust}
        label="Body Fat"
        value={bodyFat.value != null ? `${bodyFat.value.toFixed(1)}%` : '–'}
        sublabel={deltaText(bodyFat.delta)}
        sublabelColor={deltaColor(bodyFat.isGood)}
      />
      <MiniStatCard
        icon={<MaskIcon src={METRIC_ICON_IMAGES.weight} color={COLORS.steel} />}
        iconColor={COLORS.steel}
        label="Weight"
        value={weight.value != null ? `${weight.value.toFixed(1)}${weightUnit}` : '–'}
        sublabel={deltaText(weight.delta)}
        sublabelColor={deltaColor(weight.isGood)}
      />
    </div>
  )
}
