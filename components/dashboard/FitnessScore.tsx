'use client'

import { useState } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { useCountUp } from '@/lib/useCountUp'
import FitnessRing from './FitnessRing'
import FitnessScoreDetailSheet from './FitnessScoreDetailSheet'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก design brief 2 (6a) ขอ 76px เป๊ะ, ดีฟอลต์ 76 */
  size?: number
  /** true เมื่อวันนี้เป็น Rest Day จริง — ฟีดแบ็ก "Fitness Score ไม่ควรเปลี่ยนคะแนน/tier ตาม Rest Day
   * (เป็นภาพรวมสถานะ Fitness ไม่ใช่สถานะ workout วันนี้) แต่ข้อความแนะนำด้านล่าง ('Light Training')
   * ควรเปลี่ยนเป็น 'Recovery Recommended' ให้เข้ากับวันพัก (v2: เดิม 'Recovery Focus' — ฟีดแบ็กรอบถัดมา
   * บอกว่า 'Recovery Recommended' สอดคล้องกับรูปแบบ tier อื่นๆ ของ Fitness Score มากกว่า เช่น 'Light
   * Training Recommended')" — override เฉพาะข้อความบรรทัดสุดท้าย ไม่แตะ score/tier/color ใดๆ เลยตามที่ขอ */
  isRestDay?: boolean
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v10: ตัว "วง" เปลี่ยนจาก ProgressRing (SVG stroke-dasharray) มาเป็น FitnessRing (conic-gradient +
// CSS mask) ตามสเปคเอฟเฟกต์ header ชุดใหม่ — ไฟล์นี้เหลือแค่ "ประกอบร่าง" เฉพาะหน้า dashboard
// (ลิงก์ /stats, label Fitness Score/tier,
// ตัวเลขนับขึ้นด้วย useCountUp ที่มีอยู่แล้วในโปรเจกต์ — ใช้ตัวเดียวกับ GoalRing.tsx ไม่ได้สร้างซ้ำ)
// เวลาคะแนนเปลี่ยน (เช่น 89 -> 90) ทั้งตัวเลขกลางวงและเส้น progress จะไล่ขึ้นพร้อมกันนุ่มๆ
// เพราะใช้ animatedScore ตัวเดียวกันทั้งสองจุด ไม่ใช่กระโดดทันที
//
// สีวง + tier label เปลี่ยนตาม tier ของคะแนนแล้ว (score.gradientStops / score.color จาก
// lib/fitnessScore.ts) แทนที่จะเป็นสีไฟคงที่ (FIRE_ACCENT) เดิม — เพิ่มบรรทัดคำแนะนำ (score.
// recommendation) ต่อท้าย tier label ให้ผู้ใช้เข้าใจ "ควรทำอะไรต่อ" ไม่ใช่แค่เห็นตัวเลข/ชื่อ tier เฉยๆ
export default function FitnessScore({ score, size = 76, isRestDay = false }: FitnessScoreProps) {
  const animatedScore = Math.round(useCountUp(score.score, 900))
  // ฟีดแบ็ก "Fitness Score ควรมีเหตุผลที่เชื่อมกับ Score — กดแล้วเจอ breakdown ว่าทำไมได้คะแนนนี้" —
  // เดิมลิงก์ไป /stats (คอมเมนต์เดิมของไฟล์นี้ก็ยอมรับว่าเป็นแค่ทางออกชั่วคราวเพราะยังไม่มีหน้ารายละเอียด
  // คะแนนนี้จริงๆ) เปลี่ยนเป็นเปิด FitnessScoreDetailSheet แทน (ปุ่มเดียวกับ pattern MetricDetailSheet
  // ที่ Body Metrics ใช้อยู่แล้ว) ไม่ต้องนำทางออกจาก Dashboard เลย
  const [open, setOpen] = useState(false)

  return (
    // v2: FitnessScoreDetailSheet เดิมเคยวางเป็น children ตัวสุดท้ายในนี้ ก่อนปิด </button> — บั๊ก: sheet
    // มีปุ่มปิด/backdrop ของตัวเอง ซ้อน <button> ใน <button> ไม่ได้ตามหลัก HTML (browser จะ hoist ปุ่มใน
    // ออกมานอก DOM tree ที่ parse จริงเงียบๆ + click ที่ backdrop/ปุ่มปิดจะ bubble ไปโดน onClick ของปุ่ม
    // นอกด้วย เปิดใหม่ทันทีที่เพิ่งปิด) — ย้าย sheet ออกมาเป็น sibling ของปุ่ม ห่อทั้งคู่ด้วย Fragment แทน
    <>
    {/* v60: ฟีดแบ็ก "Header สูงไป 5-8% — ลด vertical gap ไม่ลด font" — gap-1.5 (6px) ระหว่างวง/tier block
        ลดเหลือ gap-1 (4px) ส่วนหนึ่งของการลดความสูงคอลัมน์นี้รวมกับ marginTop ที่ Header.tsx (52->48) และ
        margin อีก 2 จุดด้านล่าง — ทุกจุดเป็นแค่ margin/gap ไม่แตะ fontSize เลย */}
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex flex-col items-center gap-1"
      aria-haspopup="dialog"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh} — ${isRestDay ? 'วันนี้เป็นวันพัก เน้น Recovery' : score.recommendation}`}
    >
      {/* v2 (design brief 2, 6a): ตัดป้าย "Fitness Score" เหนือวงออก — สเปก brief แสดงแค่ bell → ring
          (คะแนน+/100) → tier label เท่านั้น ไม่มี micro-label เหนือวงเลย ประหยัดพื้นที่แนวตั้งของ hero
          band ให้พอดี 246px ตาม token header.height ใหม่ */}
      {/* animate-pop-in (scale 0.6→1.1→1, keyframe ที่มีอยู่แล้วใน globals.css ใช้กับ badge/pill อื่นๆ
          ในแอป) — เดิมวงมาปุ๊บนิ่งเลยตอนโหลดหน้า ไม่มี entrance animation ของตัวเองต่างจากตัวเลข/เส้น
          progress ที่นับขึ้น/ไล่ยาวอยู่แล้ว เพิ่มให้วงทั้งก้อน "ป๊อป" เข้ามาตอน mount ครั้งแรก */}
      <div className="relative flex items-center justify-center animate-pop-in">
        {/* v3 (design brief 2, 6a): ฟีดแบ็ก "ring ยังดูไม่สวย" — เทียบใกล้ๆ พบว่าวงนี้ยังใช้เอฟเฟกต์เต็มชุด
            "Dark Titanium" เดิม (titanium track gradient สว่างจ้า, bloom filter, light sweep, metal
            highlight dots, specular, brushed metal ฯลฯ จาก FitnessRing.tsx เวอร์ชันเต็ม) ที่เหลือทุกจุด
            บนหน้านี้ตัดออกไปหมดแล้วตอน rebuild ตาม brief (การ์ดอื่นทุกใบเป็นพื้นเรียบ #16191D + hairline
            ไปแล้ว) — ผลคือ track "ที่เหลือ" ของวง (ตามสเปก brief ควรจางแทบมองไม่เห็น
            rgba(255,255,255,.1)) กลายเป็นแถบไทเทเนียมทึบสว่างเห็นชัดเจนเหมือนรอยต่อ/วงแตก แถมมีจุดขาว
            (metal highlight dots) ลอยอยู่นอกวงอีก — เปลี่ยนมาใช้ FitnessRing flat mode (ดู comment เต็ม
            ที่ FitnessRing.tsx) ตรงตามสเปก brief เป๊ะ: track จางเส้นเดียว + วง progress สีตาม tier
            (ไม่มี bloom) + glow เดียวรอบนอกผ่าน box-shadow — ตัดเลเยอร์ Fog/Bloom/Core (หมอกแสง 3 ชั้น
            ซ้อนรอบนอก) + Particle (จุดฝุ่นแสง 4 จุด) + Specular (จุดสว่างมุมขวาบน) ที่เคยอยู่ตรงนี้ออกทั้งหมด
            ด้วย เพราะ box-shadow ของวง flat mode ทำหน้าที่ "แสงเรืองรอบวง" แทนอยู่แล้วตัวเดียวพอ ไม่ต้อง
            ซ้อนหมอก 3-4 ชั้นเพิ่มแบบเดิม (ยิ่งซ้อนยิ่งดูหมอกมัว ไม่ใช่ "เรืองจริง" ตามที่เคยตั้งใจไว้) */}
        <FitnessRing value={animatedScore} size={size} gradientStops={score.gradientStops} flat>
          {/* v64: ฟีดแบ็ก "48 คือข้อมูลสำคัญที่สุดของส่วนนี้ เพิ่มขนาดอีก 5-8% แต่ไม่ต้องขยาย Ring" —
              เดิม fontSize ผูกกับ size (scoreRingSize) ตรงๆ ผ่าน multiplier 0.28 — ขยับ multiplier ขึ้น
              เป็น 0.29 (ตัวเลขเดียว ไม่แตะ size เอง) ให้ตัวเลขโตขึ้น ~5.3% (19->20px ที่ size ปัจจุบัน 69)
              โดย ring ไม่ขยับตามเลย ตรงตามที่ขอเป๊ะ */}
          <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.29) }}>
            {animatedScore}
          </span>
          <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
            /100
          </span>
        </FitnessRing>
      </div>
      {/* v2 (design brief 2, 6a): ตัด status line (score.aiCoachStatus/"Recovery Recommended") ที่เคยอยู่
          ใต้ tier label ออกด้วย — สเปก brief แสดงแค่ tier label เดียว ("Excellent") ไม่มีบรรทัดคำแนะนำ
          ต่อท้าย รายละเอียด/คำแนะนำเต็มยังดูได้จาก FitnessScoreDetailSheet ที่กดเปิดจากปุ่มนี้อยู่แล้ว */}
      <div className="text-center">
        <p
          className="font-display font-bold tracked uppercase leading-tight"
          style={{ fontSize: 14, color: score.color }}
        >
          {score.tierLabel}
        </p>
      </div>
    </button>
    <FitnessScoreDetailSheet open={open} onClose={() => setOpen(false)} score={score} />
    </>
  )
}
