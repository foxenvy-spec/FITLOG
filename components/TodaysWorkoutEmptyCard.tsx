'use client'

import Link from 'next/link'
import Image from 'next/image'
import { TEXT } from '@/lib/theme'
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
          <p className="text-[10px] tracked uppercase" style={{ color: TEXT.body }}>
            Today&apos;s Workout
          </p>
          <p className="font-display tracked uppercase text-ink" style={{ fontSize: 14 }}>
            Rest Day
          </p>
          <p style={{ fontSize: 10, marginTop: 1, color: '#CFD4DE' }}>Recovery is part of progress</p>
        </div>
      </PremiumCard>
    )
  }

  return (
    <PremiumCard className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] tracked uppercase" style={{ color: TEXT.body }}>
          Today&apos;s Workout
        </p>
        <p className="font-display tracked uppercase text-ink" style={{ fontSize: 14 }}>
          No Workout Planned
        </p>
      </div>
      <Button as={Link} href="/templates" className="shrink-0">
        Choose Program →
      </Button>
    </PremiumCard>
  )
}
