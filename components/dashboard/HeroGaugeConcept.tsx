'use client'

import GoalRing from '@/components/GoalRing'
import HeroEnergyWave from './HeroEnergyWave'
import { COLORS, withAlpha } from '@/lib/theme'
import type { FitnessScoreResult } from '@/lib/fitnessScore'

// ทดลองแนวคิด "Twin Cyber Gauge" ตามมอคอัพที่ผู้ใช้ส่งมา (Fitness Score + Recovery รวมเป็นภาพเดียว
// เชื่อมด้วยคลื่นพลังงาน) — คอมโพเนนต์ทดลอง ไม่ได้ผูกเข้ากับ DashboardView.tsx จริง ดูหน้า preview ที่
// app/(app)/dashboard-concept/page.tsx
//
// ทำไมไม่ก็อปโค้ดมอคอัพมาวางตรงๆ: มอคอัพใช้ lucide-react (ไม่มีใน FITLOG, ทั้งแอปใช้ inline SVG/emoji
// ล้วน ไม่เคยมี icon library) + สี Tailwind ดีฟอลต์ (zinc/amber-400/cyan-500 ฯลฯ ไม่ตรงกับ token จริงของ
// แอป) + วาด SVG ring/wave เองใหม่ทั้งหมด — แทนที่ทั้งหมดด้วยของที่มีอยู่แล้วในแอป:
// - GoalRing (ใช้ทั่วทั้ง Dashboard อยู่แล้ว รองรับ glow prop ในตัว)
// - HeroEnergyWave (มีอยู่แล้วในโปรเจกต์ตั้งแต่ก่อนหน้านี้ — SVG คลื่นเรืองแสงพร้อม glow filter/gradient
//   fade/animation ในตัว ไม่เคยถูกใช้ในหน้า Dashboard เดสก์ท็อปมาก่อน — ตรงกับสิ่งที่มอคอัพต้องการเป๊ะ)
// - COLORS.amber/COLORS.cyan จาก lib/theme.ts (โทเคนสีจริงของแอป แทน amber-500/cyan-500 ของ Tailwind)
//
// เรื่อง "↓ 8 จากสัปดาห์ที่แล้ว" / "↗ 6% จากเมื่อวาน": มอคอัพ hardcode ข้อความนี้เป็น prop string เดียว
// ไม่มีที่มาของข้อมูลจริง — FITLOG ไม่เคยเก็บ snapshot คะแนน Fitness Score/Recovery ย้อนหลังไว้เลย (คำนวณ
// สดทุกครั้ง ไม่มีตาราง history ใน DB) เพราะฉะนั้น fitnessScoreDiff/recoveryDiff เป็น optional — ไม่ส่ง
// มาก็ไม่โชว์บรรทัดนั้น (ไม่ใช้ข้อมูลสมมติ ตามหลักที่ยึดมาตลอดทั้งแอป) ถ้าอยากได้ตัวเลขนี้จริง ต้องสร้าง
// ตาราง snapshot รายวันใหม่ก่อน — เป็นงาน backend เพิ่ม ไม่ใช่แค่ UI
interface HeroGaugeConceptProps {
  fitnessScore: FitnessScoreResult
  recoveryPct: number
  recoveryLabel: string
  fitnessScoreDiff?: string
  recoveryDiff?: string
}

export default function HeroGaugeConcept({
  fitnessScore,
  recoveryPct,
  recoveryLabel,
  fitnessScoreDiff,
  recoveryDiff,
}: HeroGaugeConceptProps) {
  return (
    <div className="relative rounded-card border border-line bg-bg overflow-hidden px-6 py-12">
      {/* คลื่นพลังงานเชื่อมสองวง — ไล่สีจากอำพัน (Fitness Score) ไปไซแอน (Recovery) ตรงกับสีของแต่ละวง */}
      <div className="absolute inset-0 flex items-center justify-center opacity-90 pointer-events-none">
        <div className="w-full max-w-3xl h-48">
          <HeroEnergyWave
            gradientStops={[
              { offset: '0%', color: fitnessScore.color },
              { offset: '100%', color: COLORS.cyan },
            ]}
          />
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-10 sm:gap-16">
        {/* Fitness Score */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] tracked uppercase text-muted mb-2">Fitness Score</p>
          <div style={{ filter: `drop-shadow(0 0 22px ${withAlpha(fitnessScore.color, '55')})` }}>
            <GoalRing
              pct={fitnessScore.score}
              size={140}
              strokeWidth={7}
              color={fitnessScore.color}
              valueLabel={String(fitnessScore.score)}
              glow
              ariaLabel={`Fitness Score ${fitnessScore.score} — ${fitnessScore.tierLabel}`}
              label={
                <span className="flex flex-col items-center mt-0.5">
                  <span className="tracked uppercase font-display font-bold" style={{ fontSize: 11, color: fitnessScore.color }}>
                    {fitnessScore.tierLabel}
                  </span>
                  {fitnessScoreDiff && (
                    <span style={{ fontSize: 9, color: COLORS.rust }} className="mt-0.5">
                      {fitnessScoreDiff}
                    </span>
                  )}
                </span>
              }
            />
          </div>
        </div>

        {/* Recovery */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] tracked uppercase text-muted mb-2">Recovery</p>
          <div style={{ filter: `drop-shadow(0 0 22px ${withAlpha(COLORS.cyan, '55')})` }}>
            <GoalRing
              pct={recoveryPct}
              size={124}
              strokeWidth={6}
              color={COLORS.cyan}
              glow
              ariaLabel={`Recovery ${recoveryPct}% — ${recoveryLabel}`}
              label={
                <span className="flex flex-col items-center mt-0.5">
                  <span className="tracked uppercase font-display font-bold" style={{ fontSize: 11, color: COLORS.cyan }}>
                    {recoveryLabel}
                  </span>
                  {recoveryDiff && (
                    <span style={{ fontSize: 9, color: COLORS.moss }} className="mt-0.5">
                      {recoveryDiff}
                    </span>
                  )}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
