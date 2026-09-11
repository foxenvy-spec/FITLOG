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

// v3: "Mobile_app_design_brief_1.zip" (option 6a) — โครงสร้าง hero เปลี่ยนไปจากรอบก่อนทั้งหมด ตามสเปกที่
// อ่านตรงจาก "FITLOG Mobile Dashboard.dc.html" (บรรทัด 39-69): รูปภาพไม่ใช่ full-cover เต็มพื้นหลังอีก
// ต่อไป — อยู่แค่ฝั่งขวา 58% ของแบนด์ (behind ring), ฝั่งซ้าย 44% เป็นพื้นเรียบ #0B0B0B ล้วนให้ข้อความอ่าน
// ง่าย มี fade แนวนอนคาบกลาง (gradient เส้นแรก) + fade แนวตั้งไล่ลงล่างให้กลืนกับพื้นหลังหน้า (เส้นสอง) —
// คอลัมน์ขวาเปลี่ยนจาก "headline + วงเรียงแนวนอน" เป็น "bell → วง → tier label" เรียงแนวตั้งซ้อนกัน — ตัด
// headline "ดีกว่าเมื่อวาน" ออก แทนที่ด้วย tagline อิตาลิกสีเหลืองอำพันฝั่งซ้ายตามสเปก (ข้อความคงคอนเซปต์
// เดียวกัน "Better Than Yesterday" แค่เปลี่ยนตำแหน่ง/ฟอนต์ตาม brief แทนที่จะเป็น "ดีกว่าเมื่อวาน" แยกแถว)
// isRestDay ยังส่งต่อให้ FitnessScore เหมือนเดิม (คุม status/aria-label เท่านั้น ไม่กระทบ layout ใหม่นี้)
export default function Header({ greetingText, notifications, fitnessScore, isRestDay = false }: HeaderProps) {
  return (
    <div
      className="relative overflow-hidden rounded-card -mx-4 -mt-4 sm:mx-0 sm:mt-0 animate-rise"
      style={{ height: dashboardSpec.header.height, background: '#0B0B0B' }}
    >
      {/* ภาพพื้นหลัง — เฉพาะฝั่งขวา 58% ของแบนด์เท่านั้น (ไม่ใช่ full-cover แบบรอบก่อน) ตามสเปก brief */}
      <div className="absolute inset-y-0 right-0" style={{ width: '58%' }} aria-hidden="true">
        <Image
          src="/images/session-complete-hero-mobile.png"
          alt=""
          fill
          className="object-cover"
          style={{ objectPosition: '50% 20%' }}
        />
      </div>
      {/* Fade แนวนอน — ทึบ #0B0B0B ที่ฝั่งซ้าย (0-44%) ให้ข้อความอ่านง่าย ค่อยจางลงคาบกับภาพช่วง 44-78% */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg,#0B0B0B 0%,#0B0B0B 44%,rgba(11,11,11,.7) 58%,transparent 78%)' }}
        aria-hidden="true"
      />
      {/* Fade แนวตั้ง — ไล่มืดลงล่างให้กลืนกับพื้นหลังหน้า (เกือบทึบที่ขอบล่าง) */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom,rgba(11,11,11,.25) 0%,transparent 34%,rgba(11,11,11,.98) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3 h-full" style={{ padding: '20px 22px 0' }}>
        <div className="min-w-0 flex flex-col">
          <Greeting text={greetingText} />
          <p className="font-display font-bold uppercase text-ink leading-none" style={{ fontSize: 30, letterSpacing: '.03em', marginTop: 6 }}>
            FITLOG
          </p>
          <p className="uppercase leading-none" style={{ fontSize: 11, color: '#6C7078', letterSpacing: '.12em', marginTop: 3 }}>
            Personalized Fitness
          </p>
          <p className="font-display italic" style={{ fontWeight: 500, fontSize: 15, color: '#E8A33D', marginTop: 12 }}>
            Better Than Yesterday
          </p>
        </div>

        <div className="flex flex-col items-center gap-2.5 shrink-0">
          <NotificationButton notifications={notifications} />
          <FitnessScore score={fitnessScore} size={dashboardSpec.header.scoreRingSize} isRestDay={isRestDay} />
        </div>
      </div>
    </div>
  )
}
