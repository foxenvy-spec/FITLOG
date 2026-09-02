'use client'

import Link from 'next/link'
import Image from 'next/image'
import { TEXT, COLORS } from '@/lib/theme'
import PremiumCard from './ui/PremiumCard'
import Button from './ui/Button'

interface TodaysWorkoutEmptyCardProps {
  // restDay: มีโปรแกรมอยู่แล้ว (data.programDays.length > 0) แต่วันนี้ไม่มีท่าที่ตั้งไว้/ยังไม่ได้บันทึกอะไร
  // noProgram: ยังไม่เคยสร้างโปรแกรมเลยสักวันเดียว (data.programDays.length === 0)
  variant: 'restDay' | 'noProgram'
}

// ฟีดแบ็ก "ไม่ควรแสดง Today's Workout แบบ '0/0 Exercises' ตอนไม่มีอะไรให้ทำวันนี้ — ควรมี state แยก
// สำหรับ Rest Day / No Program" (Section 10) — เดิม TodaysWorkoutCompactCard.tsx (การ์ด hero รูปดัมเบล
// เต็มใบ) ถูกเรียกใช้ทุกกรณีแม้ไม่มีข้อมูลจริงให้โชว์ ทำให้เห็นเลข 0/0 ที่ไม่มีความหมาย — การ์ดนี้เป็น
// ทางเลือกที่เบากว่ามาก (แถวเดียว ไอคอน+ข้อความ ไม่มีรูป/วงแหวน/progress bar) ใช้แทนตอนไม่มีอะไรให้ฝึก
// จริงๆ วันนี้ — MobileDashboardView.tsx เป็นคนเลือกว่าจะ render การ์ดไหนจาก state ที่คำนวณไว้
export default function TodaysWorkoutEmptyCard({ variant }: TodaysWorkoutEmptyCardProps) {
  if (variant === 'restDay') {
    return (
      <PremiumCard className="flex items-center gap-3 px-4 py-3">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
          aria-hidden="true"
        >
          <Image
            src="/icons/sleep.png"
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
            style={{ mixBlendMode: 'screen' }}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] tracked uppercase" style={{ color: TEXT.body }}>
            Today&apos;s Workout
          </p>
          <p className="font-display tracked uppercase text-ink" style={{ fontSize: 14 }}>
            Rest Day
          </p>
          <p style={{ fontSize: 10, marginTop: 1, color: '#CFD4DE' }}>Recovery is part of progress</p>
          {/* ฟีดแบ็ก "วันพักตามแผนควรมี Badge บอกว่า Streak ไม่ขาด กันผู้ใช้รู้สึกผิด" — ตรรกะ "วันพักตามแผน
              ไม่ตัด Streak" มีอยู่แล้วจริงใน computeCurrentStreak (lib/dashboardStats.ts) การ์ดนี้เดิมสื่อ
              "การพักเป็นส่วนหนึ่งของความก้าวหน้า" อยู่แล้วแต่ไม่ได้พูดถึง Streak ตรงๆ เลย — เพิ่มบรรทัดนี้
              ให้ชัดเจนขึ้นว่า Streak ไม่ขาดจริงๆ (คำเดียวกับที่ desktop ใช้ ดู DashboardView.tsx) */}
          <p style={{ fontSize: 10, marginTop: 1, color: COLORS.moss }}>🛌 Streak stays protected ✅</p>
        </div>
      </PremiumCard>
    )
  }

  // ฟีดแบ็ก "State B ยังไม่มีโปรแกรม ควรมี 3 ทางเลือก โดยให้ 'ให้ MINT แนะนำ' เป็นตัวเลือกเด่น เชื่อมกับ
  // AI Coach" — เดิมปุ่มเดียว "Choose Program →" พาไป /templates ตรงๆ เปลี่ยนปุ่มเด่นให้พาไปหน้า AI Coach
  // แทน (เลือกโปรแกรม/Template ยังกดถึงได้จาก Quick Actions แถวใต้การ์ดนี้ใน MobileDashboardView.tsx อยู่แล้ว
  // — การ์ดนี้กะทัดรัดมาก ไม่มีที่พอสำหรับ 3 ปุ่มในตัวเอง)
  return (
    <PremiumCard className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] tracked uppercase" style={{ color: TEXT.body }}>
          Today&apos;s Workout
        </p>
        <p className="font-display tracked uppercase text-ink" style={{ fontSize: 14 }}>
          No Workout Planned
        </p>
      </div>
      <Button as={Link} href="/coach" className="shrink-0">
        🤖 ให้ MINT แนะนำ
      </Button>
    </PremiumCard>
  )
}
