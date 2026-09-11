'use client'

import Image from 'next/image'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { DashboardNotification } from '@/lib/dashboardStats'
import { dashboardSpec } from '@/lib/dashboardSpec'
import FitnessScore from './FitnessScore'
import NotificationButton from './NotificationButton'
import Greeting from './Greeting'

interface HeaderProps {
  greetingText: string
  notifications: DashboardNotification[]
  fitnessScore: FitnessScoreResult
  /** true เมื่อวันนี้เป็น Rest Day จริง — เปลี่ยน headline ให้สอดคล้องกับ Today's Focus/Workout/AI Coach
   * ด้านล่างที่พูดถึง Rest Day ตรงกันอยู่แล้ว (ไม่ให้ headline บอก "ดีกว่าเมื่อวาน" ทั้งที่วันนี้เป็นวันพัก) */
  isRestDay?: boolean
}

// v2: ฟีดแบ็ก "ยังไม่เหมือนเลยทั้งสีกรอบแสงเงา" — เทียบ mockup ละเอียดอีกรอบพบจุดที่พลาดไปจริงในรอบก่อน:
// mockup มีภาพถ่ายคนมองจากด้านหลัง (silhouette, แสงโทนมืด) เป็นพื้นหลังของทั้งโซน Header เลย (ไม่ใช่พื้น
// เรียบเปล่าๆ แบบที่ทำไว้) — ใช้ภาพเดียวกับ Session Complete hero (session-complete-hero-mobile.png,
// คนละมุมกล้อง/คนแต่ theme เดียวกันเป๊ะ: คนมองออกจากด้านหลัง, ภูเขา/แสงเงาโทนมืด) ที่มีอยู่แล้วในแอป แทน
// การหารูปใหม่ — ใส่ scrim ไล่มืดจากล่างขึ้นบน (เข้มสุดล่าง ให้ตัวหนังสือ/วงอ่านออก, จางสุดบนให้เห็นเนื้อรูป)
// เทคนิคเดียวกับที่ session/page.tsx hero ใช้อยู่แล้ว (brightness filter + radial/linear scrim)
export default function Header({ greetingText, notifications, fitnessScore, isRestDay = false }: HeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-card -mx-4 -mt-4 sm:mx-0 sm:mt-0 animate-rise" style={{ minHeight: 220 }}>
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/images/session-complete-hero-mobile.png"
          alt=""
          fill
          className="object-cover"
          style={{ objectPosition: '50% 20%', filter: 'brightness(0.55)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(11,11,13,.35) 0%, rgba(11,11,13,.55) 40%, rgba(11,11,13,.92) 100%)' }}
        />
      </div>

      <div className="relative flex flex-col justify-between h-full p-4" style={{ minHeight: 220 }}>
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Greeting text={greetingText} />
            <p className="font-display font-extrabold tracked uppercase text-ink leading-none" style={{ fontSize: 20, marginTop: 4 }}>
              FITLOG
            </p>
          </div>
          <NotificationButton notifications={notifications} />
        </div>

        <div className="relative flex items-center justify-between gap-4" style={{ marginTop: 20 }}>
          {/* [text-wrap:balance] กัน headline ตกบรรทัดกลางคำภาษาไทยตอนคอลัมน์แคบ (ชนวงด้านขวา) */}
          <p className="font-display font-bold text-ink flex-1 min-w-0 [text-wrap:balance]" style={{ fontSize: 22, lineHeight: 1.25 }}>
            {isRestDay ? 'วันนี้เพื่อการฟื้นตัว' : 'ดีกว่าเมื่อวาน'}
          </p>
          <div className="shrink-0">
            <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} isRestDay={isRestDay} />
          </div>
        </div>
      </div>
    </div>
  )
}
