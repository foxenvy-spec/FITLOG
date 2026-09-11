'use client'

import type { FitnessScoreResult } from '@/lib/fitnessScore'
import type { DashboardNotification } from '@/lib/dashboardStats'
import { dashboardSpec } from '@/lib/dashboardSpec'
import { PAGE_REFLECTION_CSS } from '@/lib/theme'
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

// เขียนใหม่ทั้งหมดตาม mockup "Version 5 — Hero + Card Focus" ("ทำให้เหมือน Version 5 100% ไม่ต้องสน
// โครงสร้างเดิม") — เดิม Header นี้เป็น "ชื่อผู้ใช้ตัวใหญ่มาก (metallic wordmark) + วง Fitness Score เล็ก
// มุมขวา" ผ่านการลดขนาดวงหลายรอบ (69px) ให้ไม่แข่งกับ Today's Focus — mockup ใหม่กลับด้าน: ไม่มีชื่อ
// ผู้ใช้ตัวใหญ่เลย มีแค่ greeting เล็ก + wordmark แบรนด์เล็กๆ แถวบน แล้วแถวล่างเป็น headline ("Better
// Than Yesterday") คู่กับวง Fitness Score ที่ใหญ่ขึ้นชัดเจน (108px) เป็นจุดโฟกัสหลักของ Hero แทน
export default function Header({ greetingText, notifications, fitnessScore, isRestDay = false }: HeaderProps) {
  return (
    <div className="relative animate-rise">
      {/* Soft Reflection บางๆ ทั่วโซน Header — โทเคนเดียวกับที่การ์ดอื่นในแอปใช้ (ไม่ใช่ค่าลอยใหม่) */}
      <div className="absolute -inset-x-4 top-0 h-24 pointer-events-none" style={{ backgroundImage: PAGE_REFLECTION_CSS }} aria-hidden="true" />

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
        {/* [text-wrap:balance] กัน headline ตกบรรทัดกลางคำภาษาไทยตอนคอลัมน์แคบ (ชนวงด้านขวา) —
            เหตุผลเดียวกับที่เคยแก้ปัญหานี้ใน Header เวอร์ชันก่อน */}
        <p className="font-display font-bold text-ink flex-1 min-w-0 [text-wrap:balance]" style={{ fontSize: 22, lineHeight: 1.25 }}>
          {isRestDay ? 'วันนี้เพื่อการฟื้นตัว' : 'ดีกว่าเมื่อวาน'}
        </p>
        <div className="shrink-0">
          <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} isRestDay={isRestDay} />
        </div>
      </div>
    </div>
  )
}
