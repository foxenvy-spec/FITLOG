'use client'

import Link from 'next/link'
import Image from 'next/image'
import { COLORS, FIRE_GRADIENT_CSS } from '@/lib/theme'
import AnimatedBarFill from './AnimatedBarFill'
import PremiumCard from './ui/PremiumCard'

interface TodaysWorkoutCompactCardProps {
  completed: number
  total: number
  href: string
}

// การ์ด "Today's Workout" — v4: จัดเลย์เอาต์ใหม่ตามภาพอ้างอิงที่ผู้ใช้ส่งมา (ตัวเลขเศษส่วนใหญ่ขึ้น
// เป็นจุดเด่นหลัก แยกบรรทัดจาก label ด้านบน + progress bar เต็มความกว้างพร้อมปุ่มลูกศรวงกลมลอยท้าย
// แถบ) แทนที่แถวเดียวแบบ v2/v3 เดิม — การ์ดสูงขึ้นจาก ~80px เป็นประมาณ 130-140px ตามที่ขอ ไม่มี wrapper
// ไหนใน MobileDashboardView กำหนดความสูงตายตัวไว้ (แค่ space-y ปกติ) จึงขยายได้อย่างปลอดภัย
//
// ไอคอนดัมเบลเล็ก (แถวบน) ยังใช้ mixBlendMode: screen เหมือนเดิม (พื้นดำของรูปกลืนเข้ากับพื้นหลังวงสี
// อำพันจางๆ) แต่ปุ่มลูกศรตอนนี้ใหญ่ขึ้นและทำหน้าที่เป็นปุ่มกดจริงๆ แยกเป็นชิ้นเด่นของตัวเอง — รูปนี้ทรง
// วงกลมมีขอบ/glow อยู่ในตัวอยู่แล้ว จึงปล่อยพื้นดำของมันไว้ตามธรรมชาติ (ไม่ blend) ให้ดูเป็นปุ่มวงกลมจริง
// แทนที่จะกลืนหายไปเป็นแค่ไอคอนแบนๆ เหมือนตอนใช้เป็นไอคอนเล็กแทรกในข้อความ
export default function TodaysWorkoutCompactCard({ completed, total, href }: TodaysWorkoutCompactCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <PremiumCard
      as={Link}
      href={href}
      className="relative overflow-hidden block active:scale-[0.99] transition"
      // ความสูงขั้นต่ำตาม spacing token ใหม่ (Workout Card 180-200px, เดิมสูงตามเนื้อหา ~130-140px)
      style={{ padding: 18, minHeight: 180 }}
    >
      {/* พื้นหลังฉากยิม — โฟกัสฝั่งขวาที่มีดัมเบลเรืองแสง เปิดให้เห็นชัดขึ้นกว่า v3 (เนื้อหาทั้งหมดตอนนี้
          ชิดซ้ายเป็นคอลัมน์เดียว ไม่ได้ทับพื้นที่ฝั่งขวาเหมือนเดิม) ไล่เฉดมืดจากซ้ายทับอีกชั้นแค่พอให้
          ตัวหนังสืออ่านออก ไม่ต้องมืดจัดเท่า v3 */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <Image src="/images/today-workout-bg-mobile.png" alt="" fill className="object-cover" style={{ objectPosition: '80% 55%' }} />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(20,22,26,0.95) 0%, rgba(20,22,26,0.8) 40%, rgba(20,22,26,0.25) 100%)' }}
        />
      </div>

      <div className="relative z-10">
        {/* แถวบน — ไอคอนเล็ก + label */}
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: `${COLORS.amber}22` }}
            aria-hidden="true"
          >
            <Image
              src="/icons/today-workout-icon-dumbbell.png"
              alt=""
              width={32}
              height={32}
              className="w-full h-full object-cover"
              style={{ mixBlendMode: 'screen' }}
            />
          </span>
          <p className="text-[11px] tracked uppercase text-muted">Today&apos;s Workout</p>
        </div>

        {/* เศษส่วนตัวใหญ่ — จุดเด่นหลักของการ์ดตามภาพอ้างอิง */}
        <div className="flex items-baseline gap-1 mt-3">
          <span className="font-mono text-ink font-bold leading-none" style={{ fontSize: 34 }}>
            {completed}
          </span>
          <span className="text-muted leading-none" style={{ fontSize: 18 }}>
            /{total}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">ท่าที่ทำแล้ว</p>

        {/* progress bar เต็มความกว้าง + ปุ่มลูกศรวงกลมท้ายแถบ */}
        <div className="flex items-center gap-3 mt-4">
          <div className="h-2 rounded-full bg-surface2 flex-1 overflow-hidden">
            <AnimatedBarFill pct={pct} color={COLORS.amber} background={FIRE_GRADIENT_CSS} />
          </div>
          <span className="shrink-0 w-9 h-9" aria-hidden="true">
            <Image src="/icons/today-workout-icon-arrow.png" alt="" width={36} height={36} className="w-full h-full object-cover rounded-full" />
          </span>
        </div>
      </div>
    </PremiumCard>
  )
}
