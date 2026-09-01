'use client'

import type { VolumeIncrease } from '@/lib/dashboardStats'

// ฟีดแบ็ก "ลองเอาไปแทรกของจริง" หลังลองบนหน้า preview /dashboard-concept แล้วโอเค — ย้ายมาเป็น
// component ใช้ซ้ำได้ (เดิมเขียนอยู่ในหน้า preview ตรงๆ) ทุกตัวเลขเป็นข้อมูลจริงจาก data ที่
// DashboardView.tsx คำนวณอยู่แล้ว ไม่ query/คำนวณซ้ำ — ตัด "Achievements ใหม่"/nutrition insight ที่
// มอคอัพต้นฉบับมีออก เพราะยังไม่มีระบบคำนวณ "ใหม่ล่าสุด" หรือข้อมูลอาหารให้ใช้จริง
//
// หมายเหตุ: "Quick Action" ที่หน้า preview เคยมีคู่กัน ไม่ได้ตามมาด้วยตอนแทรกของจริง — เช็คแล้วพบว่า
// DashboardView.tsx มีแถว QuickAction ของตัวเองอยู่แล้ว (บันทึกสถิติ/เลือกโปรแกรม/วิเคราะห์ร่างกาย/
// สถิติ/ถาม AI — ดูใกล้ WeeklyMuscleHeatmap) เพิ่มอีกแถวจะซ้ำซ้อนกับของเดิมที่มีอยู่แล้ว (คนละลิงก์กัน
// จะยิ่งสับสน) เก็บไว้แค่ Highlights ซึ่งเป็นข้อมูลที่ยังไม่มีจริงเท่านั้น
function HighlightTile({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-lg bg-surface2 px-3 py-2.5 flex-1 min-w-[120px]">
      <p className="text-lg leading-none">{icon}</p>
      <p className="font-mono font-bold text-ink mt-1.5" style={{ fontSize: 18 }}>
        {value}
      </p>
      <p className="text-[12px] text-muted mt-0.5">{label}</p>
    </div>
  )
}

interface HighlightsRowProps {
  streak: number
  bestVolumeIncrease: VolumeIncrease | null
  weeklyConsistencyPct: number | null
}

export default function HighlightsRow({ streak, bestVolumeIncrease, weeklyConsistencyPct }: HighlightsRowProps) {
  return (
    <div className="rounded-lg border border-line bg-surface2/40 px-4 py-3.5 space-y-2.5">
      <p className="text-[12px] tracked uppercase text-muted">Highlights</p>
      <div className="flex flex-wrap gap-2.5">
        <HighlightTile icon="🔥" value={`${streak} วัน`} label="Streak ต่อเนื่อง" />
        {bestVolumeIncrease && (
          <HighlightTile icon="📈" value={`+${bestVolumeIncrease.pct}%`} label={`${bestVolumeIncrease.muscleGroup} เพิ่มขึ้นจากสัปดาห์ก่อน`} />
        )}
        {weeklyConsistencyPct != null && <HighlightTile icon="✅" value={`${weeklyConsistencyPct}%`} label="Consistency (21 วันล่าสุด)" />}
      </div>
    </div>
  )
}
