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
// หลังกลับมา ("Hero Section: ภาพพื้นหลังสร้างอารมณ์และเอกลักษณ์ของ FITLOG") — scrim ไล่มืดจากบนลงล่าง (เข้ม
// สุดล่างให้ตัวหนังสือ/พื้นหลังหน้าถัดไปกลืนกันสนิท) เทคนิคเดียวกับที่เคยพิสูจน์แล้วว่าอ่านออกจริงตอน
// "brief 2" — โพลิชข้อ "ลดความสูง Header 5-8%" ทำผ่าน minHeight ที่ตั้งใจให้กระชับ (190px) ไม่ใช่ปล่อยให้
// สูงเท่าที่เนื้อหาต้องการเฉยๆ
// v4: ผู้ใช้ส่งรูปใหม่มาเอง (home-header-hero.png, 2560×1440 แนวนอน) แทนที่ session-complete-hero-
// mobile.png เดิม (ยืม asset จากหน้า session-complete มาใช้ชั่วคราว) — ไฟล์เดิมยังอยู่ ใช้ต่อที่หน้า
// session/page.tsx (หน้าจอสรุปผลหลังจบเวิร์กเอาต์) แยกกันคนละจุด ไม่เกี่ยวกัน ไม่ลบทิ้ง
// v5: ฟีดแบ็ก "เอาไล่มืดออกให้หน่อยครับ" — ตัด scrim gradient ทับรูปออกทั้งหมดตามที่ขอ (รูปใหม่นี้มืด/
// คอนทราสต์พออ่านตัวหนังสือขาวออกอยู่แล้วโดยไม่ต้องพึ่ง scrim เหมือนรูปเก่า)
// v6: ฟีดแบ็ก (เทียบ poster รอบละเอียด) "รูป 3 ทำให้ภาพภูเขาเป็นส่วนหนึ่งของ background (atmosphere)
// รูป 1-2 ของจริงยังเป็น banner แยกชิ้นชัดเจน (ขอบ+เงาเข้มตัดกับพื้นหลังหน้า)" — เพิ่ม fade overlay
// ไล่จากโปร่งใสไปเป็นสีพื้นหลังหน้า (#0a0d12) เฉพาะโซนล่างสุด (48px) ให้ภาพ "ละลาย" เข้ากับพื้นหลังแทนที่
// จะตัดขอบแข็งแบบเดิม (วางไว้ก่อนเนื้อหา content ใน DOM order เนื้อหาเลยยัง render ทับด้านบนเสมอ ไม่ถูก
// fade กระทบ) + ลด boxShadow ลง (.4 -> .28) ให้ดูเป็นพื้นผิวเดียวกับหน้า ไม่ใช่การ์ดลอยแยกชัด
// v7: ฟีดแบ็ก "ภูเขาเด่นเกินไปนิดหนึ่ง ดูเหมือน fitness+travel/adventure app มากกว่า Dark Titanium — ลด
// contrast ของภาพลง ~15-25% ให้ภาพทำหน้าที่เป็น background มากกว่าพระเอก" — ใช้ CSS filter ลด
// contrast/saturation ของรูปโดยตรง (ไม่ใช่ทับ scrim มืดแบบที่เพิ่งเอาออกไปตามฟีดแบ็กก่อนหน้า — คนละ
// เทคนิค คนละจุดประสงค์: scrim เดิมมีไว้กันตัวหนังสืออ่านไม่ออก ส่วนนี้มีไว้ลด "ความเป็นพระเอก" ของภาพเอง)
export default function Header({ greetingText, displayName, notifications }: HeaderProps) {
  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 20, minHeight: 190, boxShadow: '0 4px 14px rgba(0,0,0,.28)' }}>
      <Image
        src="/images/home-header-hero.png"
        alt=""
        fill
        className="object-cover"
        style={{ objectPosition: '50% 25%', filter: 'contrast(0.8) saturate(0.8) brightness(0.92)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: 48, background: 'linear-gradient(180deg, transparent 0%, #0a0d12 100%)' }}
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
