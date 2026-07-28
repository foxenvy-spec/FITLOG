'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { FIRE_GRADIENT_STOPS, FIRE_ACCENT, NEUTRAL } from '@/lib/theme'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v7: gradient ของวงเปลี่ยนมาใช้ FIRE_GRADIENT_STOPS ชุดเดียวกับ AnimatedWave เป๊ะๆ (ไม่ใช่แค่
// เฉดสว่าง/เข้มของสีเดียวแบบ v6) ให้ Wave กับ Ring เป็นงานออกแบบชิ้นเดียวกันจริงๆ ตามฟีดแบ็ก
// พื้นหลังวง (track) เปลี่ยนเป็นโทนอุ่น NEUTRAL.ringTrackWarm (แทน #23272D เทาเย็นเดิม) ให้วง
// สีส้ม/ทองตัดกับพื้นหลังชัดขึ้น
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const strokeWidth = Math.round(size * 0.08)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score.score / 100)
  const gradId = useId()
  const glowId = useId()

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <defs>
            {/* gradient เดียวกับ AnimatedWave เป๊ะ — วนรอบวงผ่าน linearGradient แนวทแยง */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              {FIRE_GRADIENT_STOPS.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
            {/* outer glow — ส้ม/ทอง เบลอ 24-32px ตามสเปก (คำนวณสัดส่วนกับขนาดวงจริง) */}
            <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation={Math.max(8, strokeWidth * 0.9)} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={NEUTRAL.ringTrackWarm} strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            filter={`url(#${glowId})`}
            style={{ mixBlendMode: 'screen' }}
          />
          {/* glossy rim — เส้นบางสว่างจ้าแนบผิวด้านในของวงหลัก ให้ความรู้สึกผิวมันวาว/3 มิติ */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth * 0.32}
            fill="none"
            stroke="#FFF4CC"
            strokeWidth={Math.max(1, strokeWidth * 0.12)}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeOpacity={0.55}
            style={{ mixBlendMode: 'screen' }}
          />
        </svg>
        {/* inner shadow บางๆ ด้านในวง ให้ตัวเลขตรงกลางดูจมลงไปนิดหนึ่งแทนที่จะลอยแบน */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ inset: strokeWidth, boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)' }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
            {score.score}
          </span>
          <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
            /100
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="tracked uppercase text-muted leading-none" style={{ fontSize: 10 }}>
          Fitness Score
        </p>
        <p
          className="font-display font-bold tracked uppercase leading-tight mt-1"
          style={{ fontSize: 14, color: FIRE_ACCENT }}
        >
          {score.tierLabel}
        </p>
      </div>
    </Link>
  )
}
