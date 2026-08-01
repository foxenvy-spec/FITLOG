'use client'

import Link from 'next/link'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { useCountUp } from '@/lib/useCountUp'
import FitnessRing from './FitnessRing'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
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
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const animatedScore = Math.round(useCountUp(score.score, 900))

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh} — ${score.recommendation}`}
    >
      {/* animate-pop-in (scale 0.6→1.1→1, keyframe ที่มีอยู่แล้วใน globals.css ใช้กับ badge/pill อื่นๆ
          ในแอป) — เดิมวงมาปุ๊บนิ่งเลยตอนโหลดหน้า ไม่มี entrance animation ของตัวเองต่างจากตัวเลข/เส้น
          progress ที่นับขึ้น/ไล่ยาวอยู่แล้ว เพิ่มให้วงทั้งก้อน "ป๊อป" เข้ามาตอน mount ครั้งแรก */}
      <div className="relative flex items-center justify-center animate-pop-in">
        {/* Bloom หลังวง — เดิมไม่มีเลย (ตัด Glow wrapper ออกตอนลดความสูง header รอบก่อน) ทำให้วงลอย
            อยู่บนพื้นเปล่าๆ ไม่มี "แสงส่องจากด้านหลัง" แบบภาพอ้างอิง — ใช้สี tier ปัจจุบัน (score.color)
            ไม่ตายตัวเป็นส้มเสมอ ให้ยังสัมพันธ์กับสีวง/ข้อความเหมือนจุดอื่นในหน้า */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            background: `radial-gradient(circle, ${score.color}2E, transparent 65%)`,
          }}
          aria-hidden="true"
        />
        <FitnessRing value={animatedScore} size={size} gradientStops={score.gradientStops}>
          <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
            {animatedScore}
          </span>
          <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
            /100
          </span>
        </FitnessRing>
      </div>
      {/* ตัดบรรทัด "Fitness Score" micro-label ออก (เดิมอยู่เหนือ tier label) — ความหมายของวงชัดเจน
          อยู่แล้วจากบริบท (ตัวเลข 0-100 + /100 กลางวง) ไม่ต้องมีป้ายชื่อซ้ำ ประหยัดพื้นที่แนวตั้งได้อีก
          ชั้นหนึ่ง — บรรทัด recommendation ยังคงบังคับบรรทัดเดียว (nowrap+ellipsis) เพราะข้อความยาว
          (เช่น "Your body needs recovery") ดันให้คอลัมน์วงสูงกว่าคอลัมน์ซ้ายมาก */}
      <div className="text-center">
        <p
          className="font-display font-bold tracked uppercase leading-tight"
          style={{ fontSize: 14, color: score.color }}
        >
          {score.tierLabel}
        </p>
        <p
          className="text-muted leading-tight mt-0.5"
          style={{ fontSize: 9, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {score.recommendation}
        </p>
      </div>
    </Link>
  )
}
