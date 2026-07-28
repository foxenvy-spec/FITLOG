'use client'

import Link from 'next/link'
import { useId } from 'react'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { FIRE_ACCENT, lighten } from '@/lib/theme'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v6: สีของวง + label เปลี่ยนเป็น FIRE_ACCENT คงที่ (ไม่ dynamic ตาม tier อีกต่อไป) ตามฟีดแบ็กให้
// ตรงกับสีในรูปตัวอย่าง — ตัวเลขคะแนนกับคำว่า tier (Excellent/Good/...) ยังบอกความหมายจริงอยู่
// แค่ "สี" ไม่ได้ผูกกับ tier แล้ว
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const strokeWidth = Math.round(size * 0.08)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score.score / 100)
  const gradId = useId()
  const glowId = useId()

  const color = FIRE_ACCENT
  const hot = lighten(color, 0.5)

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh}`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <defs>
            {/* gradient stroke แบบ "ไฟ" — เข้มตรงจุดเริ่ม (12 นาฬิกา) ไล่สว่างจ้าตรงกลางส่วนโค้ง
                แล้วเข้มลงอีกครั้งใกล้ปลายเข็ม ให้ความรู้สึกมีแกนสว่างพุ่งอยู่ตรงกลางเส้น */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.75" />
              <stop offset="45%" stopColor={hot} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
            {/* outer glow — blur แล้ว merge กลับเข้ากับเส้นจริง ให้ฟุ้งแบบมีแกนสว่างชัดตรงกลาง
                ไม่ใช่แค่จางๆ แบบ drop-shadow เฉยๆ */}
            <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation={strokeWidth * 0.7} result="blur" />
              {/* วาง blur ซ้ำสองชั้นก่อน SourceGraphic ให้แสง glow เข้มขึ้นอีกนิด (alpha compositing
                  ซ้อนกัน) โดยไม่ต้องเพิ่ม stdDeviation จนฟุ้งเกินไป */}
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#23272D" strokeWidth={strokeWidth} />
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
          {/* glossy rim — เส้นบางสว่างจ้าแนบผิวด้านในของวงหลัก (รัศมีเล็กกว่าเส้นหลักนิดหน่อย)
              ให้ความรู้สึกผิวมันวาว/3 มิติ เหมือนแสงสะท้อนขอบท่อไฟ ไม่ใช่วงแบนสีทึบเดียว */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - strokeWidth * 0.32}
            fill="none"
            stroke={lighten(color, 0.8)}
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
          style={{ fontSize: 14, color }}
        >
          {score.tierLabel}
        </p>
      </div>
    </Link>
  )
}
