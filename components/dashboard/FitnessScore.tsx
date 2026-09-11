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
        {/* Bloom หลังวง — เดิมไม่มีเลย (ตัด Glow wrapper ออกตอนลดความสูง header รอบก่อน) ทำให้วงลอย
            อยู่บนพื้นเปล่าๆ ไม่มี "แสงส่องจากด้านหลัง" แบบภาพอ้างอิง — ใช้สี tier ปัจจุบัน (score.color)
            ไม่ตายตัวเป็นส้มเสมอ ให้ยังสัมพันธ์กับสีวง/ข้อความเหมือนจุดอื่นในหน้า
            v18: ฟีดแบ็ก "Orange Glow ยังเป็น Layer เดียว อยากให้รู้สึกว่ามันเรืองจริง" — แยกจาก 1 ชั้นเป็น
            5 ชั้นตามลำดับที่ขอ (Core/Bloom/Fog อยู่หลังวง, Particle/Specular อยู่หน้าวงแต่นอกรัศมีตัวเลข
            กลาง ไม่บังเนื้อหา) ทั้งหมด static ตามที่ยืนยัน ไม่มี animation/gyroscope */}
        {/* v20: ฟีดแบ็ก "Glow + Ring + Orange + Background รวมกันเด่นไปหน่อย ลดลงเล็กน้อย" — 3 ชั้น Fog/
            Bloom/Core ด้านล่างลดอัลฟาลง ~15% ทั้งชุด (14/26/40 -> 11/20/36 hex) ยังคงลำดับความเข้มเดิม
            (Fog จางสุด -> Core เข้มสุด) แค่ลดความเข้มรวมลง ไม่ตัดชั้นไหนออก */}
        {/* Fog — วงนอกสุด กว้างที่สุด จางที่สุด จำลองหมอกแสงฟุ้งไกลรอบนอก */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 2.6,
            height: size * 2.6,
            background: `radial-gradient(circle, ${score.color}11, transparent 60%)`,
          }}
          aria-hidden="true"
        />
        {/* Bloom — ชั้นเดิม ปรับอัลฟาลงเล็กน้อยเพราะตอนนี้มี Fog ห่อรอบนอกอีกชั้นแล้ว
            v30: ฟีดแบ็ก "ring-bloom-breathe ❌ Bloom ควรนิ่ง" — ตัด animation หายใจ (v22) ออก กลับไปนิ่ง
            เหมือน Fog/Core ชั้นอื่นๆ รอบๆ วง */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            background: `radial-gradient(circle, ${score.color}20, transparent 65%)`,
          }}
          aria-hidden="true"
        />
        {/* Core — วงในสุด แคบ เข้มกว่าจุดอื่น จำลองแกนแสงตรงกลางที่ตัววงลอยอยู่เหนือ */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.05,
            height: size * 1.05,
            background: `radial-gradient(circle, ${score.color}36, transparent 55%)`,
          }}
          aria-hidden="true"
        />
        <FitnessRing value={animatedScore} size={size} gradientStops={score.gradientStops}>
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
        {/* Tiny Particle — จุดแสงเล็กๆ กระจายรอบวง (คงที่ ไม่ animate) จำลองประกายฝุ่นแสงที่ลอยอยู่ในหมอก */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              `radial-gradient(circle 2px at 14% 20%, ${score.color}99, transparent 100%)`,
              `radial-gradient(circle 1.5px at 88% 26%, ${score.color}80, transparent 100%)`,
              `radial-gradient(circle 1.5px at 80% 88%, ${score.color}70, transparent 100%)`,
              `radial-gradient(circle 1px at 20% 84%, ${score.color}60, transparent 100%)`,
            ].join(', '),
          }}
          aria-hidden="true"
        />
        {/* Specular Highlight — จุดสว่างจ้าเล็กๆ จุดเดียว มุมบนขวาของวง จำลองแสงกระทบผิวมันวาว
            (offset ด้วย top/right ไม่ใช่กึ่งกลาง กันไม่ให้ทับตัวเลขกลางวง) */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 8,
            height: 8,
            top: size * 0.08,
            right: size * 0.12,
            background: 'radial-gradient(circle, rgba(255,255,255,.85), transparent 70%)',
          }}
          aria-hidden="true"
        />
        {/* v31: ฟีดแบ็ก "เหลือแค่ 7 Animation ทั้งแอป — Ring: rotate 12s + spark ตอน sweep ผ่าน" — เดิมมี
            sweep+spark ของตัวเองอยู่ตรงนี้ (ring-sweep-wrap/ring-tiny-spark) ซ้อนทับกับ light sweep ที่
            FitnessRing.tsx (ซึ่งวงนี้ห่ออยู่) มีอยู่แล้วในตัว (.animate-ring-sweep-slow) — กลายเป็นวงเดียว
            มีจุดสว่างหมุนอยู่ 2 จุดพร้อมกันโดยไม่จำเป็น ตัดชุดนี้ทิ้งทั้งหมด รวม "spark ตอน sweep ผ่าน" เข้า
            ไปเป็นการกะพริบของจุดสว่างใน FitnessRing.tsx เองแทน (ดูคอมเมนต์ v31 ที่ไฟล์นั้น) — เหลือ animation
            เดียวของวงทั้งก้อนจริงๆ ไม่ใช่ 2 ชั้นซ้อนกัน */}
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
