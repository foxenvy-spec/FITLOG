'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardData } from '../dashboard/DashboardView'
import { computeFitnessScore } from '@/lib/fitnessScore'
import { computeRecoveryPct, recoveryTier } from '@/lib/dashboardStats'
import { RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import HeroGaugeConcept from '@/components/dashboard/HeroGaugeConcept'
import HighlightsRow from '@/components/dashboard/HighlightsRow'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

// ฟีดแบ็ก "อยากดูเองก่อนเลือก" (ทั้ง Body Composition แบบรูปคน กับ Highlights/Quick Action แถวใหม่) —
// เช็คแล้ว "Body Composition แบบรูปคน" มีอยู่แล้วจริงในแอป (components/MuscleBodyDiagram.tsx ใช้อยู่ใน
// WeeklyMuscleHeatmap.tsx อยู่แล้ว รูปหน้า/หลังจริงพร้อม mask ต่อกลุ่มกล้ามเนื้อ ไม่ใช่ไดอะแกรมนามธรรม
// เหมือนที่คิด — ไม่ต้องสร้างใหม่ ดูได้จากการ์ด Muscle Heatmap ใน /dashboard ตอนนี้เลย) จึงทำ preview
// เพิ่มแค่ส่วนที่ยังไม่มีจริง: แถว Highlights (สรุปเร็ว) — ทุกตัวเลขเป็นข้อมูลจริงจาก fetchDashboardData
// ตัวเดียวกับ Dashboard จริง ไม่มีตัวไหนสมมติ (ตัด "Achievements ใหม่"/nutrition insight ออกจากมอคอัพ
// เพราะยังไม่มีระบบคำนวณ "ใหม่ล่าสุด" หรือข้อมูลอาหารให้ใช้จริง)
// Highlights ย้ายไปเป็น components/dashboard/HighlightsRow.tsx แล้ว (ใช้ร่วมกับ /dashboard จริงหลัง
// "ลองเอาไปแทรกของจริง") — ที่นี่แค่ import มาแสดงเหมือนเดิม ไม่ก็อปโค้ดซ้ำ ส่วน Quick Action ยังอยู่ที่
// หน้า preview นี้ที่เดียว (ไม่ได้ตามไป /dashboard จริง เพราะซ้ำกับแถว QuickAction ที่มีอยู่แล้วที่นั่น)
function QuickActionLink({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg bg-surface2 hover:bg-surface2/70 transition px-3 py-2.5 flex-1 min-w-[100px] text-center">
      <p className="text-lg leading-none">{icon}</p>
      <p className="text-[12px] text-muted mt-1.5">{label}</p>
    </Link>
  )
}

// หน้าทดลอง (ไม่ผูกกับ navigation/sidebar ที่ไหนเลย เข้าถึงได้เฉพาะพิมพ์ URL ตรงๆ เท่านั้น) — ให้ลอง
// แนวคิด "Twin Cyber Gauge" เชื่อมด้วยคลื่นพลังงาน จากมอคอัพที่ผู้ใช้ส่งมา โดยไม่แตะ /dashboard จริงเลย
// สักบรรทัด — ตั้งใจให้ push แค่ branch ทดลอง ไม่ push ขึ้น main ตามที่ขอ "ยังไม่ต้องขึ้น production"
//
// ใช้ fetchDashboardData ตัวเดียวกับหน้า Dashboard จริง (export ไว้แล้วจาก DashboardView.tsx) แล้ว
// คำนวณ Fitness Score/Recovery ด้วยสูตรเดียวกับ DashboardView.tsx เป๊ะ (บรรทัด 875-885 ของไฟล์นั้น) —
// ข้อมูลที่เห็นในนี้คือข้อมูลจริงของบัญชีที่ล็อกอินอยู่ ไม่ใช่ mock
export default function DashboardConceptPreviewPage() {
  const supabase = createClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-concept-preview'],
    queryFn: () => fetchDashboardData(supabase),
    staleTime: 60_000,
  })

  if (isLoading || !data) return <LoadingState />
  if (isError) {
    return <ErrorState title="โหลดข้อมูลไม่สำเร็จ" message="ลองใหม่อีกครั้ง" onRetry={() => refetch()} />
  }

  const trainedRecoveryMuscles = RECOVERY_MUSCLES.filter((mg) => data.recoveryDates[mg])
  const recoveryPctMap: Record<string, number> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
  })
  const recoveryPct =
    trainedRecoveryMuscles.length > 0
      ? Math.round(trainedRecoveryMuscles.reduce((sum, mg) => sum + recoveryPctMap[mg], 0) / trainedRecoveryMuscles.length)
      : 0

  const fitnessScore = computeFitnessScore([
    { key: 'workout', label: 'Workout Completion', value: Math.round((data.last7DaysTrainedCount / 7) * 100), weight: 30 },
    { key: 'streak', label: 'Streak', value: Math.min(100, Math.round((data.streak / 14) * 100)), weight: 20 },
    { key: 'sleep', label: 'Sleep', value: null, weight: 20 },
    { key: 'recovery', label: 'Recovery', value: trainedRecoveryMuscles.length > 0 ? recoveryPct : null, weight: 15 },
    { key: 'weeklyGoal', label: 'Weekly Goal', value: data.weeklyGoalPct, weight: 10 },
    { key: 'activityToday', label: 'Activity Today', value: data.todayExercises.length > 0 ? 100 : 0, weight: 5 },
  ])

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-4">
      <div className="rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5">
        <p className="text-[12px] text-amber font-medium">🧪 EXPERIMENTAL PREVIEW</p>
        <p className="text-[12px] text-muted mt-0.5">
          ทดลองแนวคิด Hero Gauge เท่านั้น — ไม่ได้เชื่อมกับหน้า Dashboard จริง, ไม่ได้ผูกไว้ใน navigation,
          และไม่ได้ push ขึ้น main/production ข้อมูลที่เห็นด้านล่างเป็นข้อมูลจริงของบัญชีนี้
          (คำนวณด้วยสูตรเดียวกับ Dashboard จริง) ยกเว้นบรรทัด &quot;จากสัปดาห์ที่แล้ว/จากเมื่อวาน&quot;
          ที่ยังไม่มีในนี้ เพราะ FITLOG ยังไม่มีระบบเก็บ snapshot คะแนนย้อนหลัง
        </p>
      </div>
      <HeroGaugeConcept fitnessScore={fitnessScore} recoveryPct={recoveryPct} recoveryLabel={recoveryTier(recoveryPct).labelEn} />

      <HighlightsRow streak={data.streak} bestVolumeIncrease={data.bestVolumeIncrease} weeklyConsistencyPct={data.weeklyConsistencyPct} />

      <div className="rounded-lg border border-line bg-surface px-4 py-4 space-y-3">
        <p className="text-[12px] tracked uppercase text-muted">Quick Action</p>
        <div className="flex flex-wrap gap-2.5">
          <QuickActionLink icon="▶" label="เริ่มเทรน" href="/train" />
          <QuickActionLink icon="⏱" label="Timer" href="/timer" />
          <QuickActionLink icon="📥" label="นำเข้าข้อมูล" href="/import" />
          <QuickActionLink icon="🗓" label="โปรแกรม" href="/program" />
        </div>
      </div>
    </div>
  )
}
