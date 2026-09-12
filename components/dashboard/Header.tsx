'use client'

import Image from 'next/image'
import type { DashboardNotification } from '@/lib/dashboardStats'
import NotificationButton from './NotificationButton'

interface HeaderProps {
  greetingText: string
  displayName: string
  notifications: DashboardNotification[]
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="#0a0d12" />
    </svg>
  )
}

// v3: ฟีดแบ็ก (design review poster, "Version 2 — 9.3/10") "ทำให้เหมือน 100%" — รอบก่อน (v2, "New_mobile_
// app.zip" ตรงๆ) ตัด hero photo ออกทั้งหมดเพราะสเปกนั้นไม่มี แต่รอบรีวิวถัดมาระบุชัดว่า Header ควรมีภาพพื้น
// หลังกลับมา ("Hero Section: ภาพพื้นหลังสร้างอารมณ์และเอกลักษณ์ของ FITLOG") — ใช้ภาพเดียวกับที่เคยใช้ตอน
// "brief 2" (session-complete-hero-mobile.png, คนมองภูเขา/พระอาทิตย์ตก โทนเดียวกับที่ภาพรีวิวโชว์) แทนที่
// จะหารูปใหม่ — scrim ไล่มืดจากบนลงล่าง (เข้มสุดล่างให้ตัวหนังสือ/พื้นหลังหน้าถัดไปกลืนกันสนิท) เทคนิค
// เดียวกับที่เคยพิสูจน์แล้วว่าอ่านออกจริงตอน "brief 2" — โพลิชข้อ "ลดความสูง Header 5-8%" ทำผ่าน minHeight
// ที่ตั้งใจให้กระชับ (190px) ไม่ใช่ปล่อยให้สูงเท่าที่เนื้อหาต้องการเฉยๆ
export default function Header({ greetingText, displayName, notifications }: HeaderProps) {
  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 20, minHeight: 190, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
      <Image
        src="/images/session-complete-hero-mobile.png"
        alt=""
        fill
        className="object-cover"
        style={{ objectPosition: '50% 25%' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(10,13,18,.4) 0%, rgba(10,13,18,.6) 45%, rgba(10,13,18,.94) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative" style={{ padding: '16px 16px 18px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <div
              className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 26, height: 26, background: 'linear-gradient(135deg,#ff9a3d,#ff5f1f)' }}
              aria-hidden="true"
            >
              <BoltIcon />
            </div>
            <span className="font-homeNum font-extrabold text-white" style={{ fontSize: 15, letterSpacing: '0.5px' }}>
              FITLOG
            </span>
          </div>
          <NotificationButton notifications={notifications} variant="flat" />
        </div>

        <div>
          <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, marginBottom: 2 }}>
            {greetingText}
          </p>
          <p className="font-homeNum font-extrabold text-white leading-[1.1]" style={{ fontSize: 30 }}>
            {displayName}
          </p>
          <p className="font-homeTh italic font-semibold" style={{ color: '#ff8a3d', fontSize: 13, marginTop: 2 }}>
            Better Than Yesterday
          </p>
        </div>
      </div>
    </div>
  )
}
