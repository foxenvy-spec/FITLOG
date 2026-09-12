'use client'

import type { DashboardNotification } from '@/lib/dashboardStats'
import NotificationButton from './NotificationButton'

interface HeaderProps {
  greetingText: string
  displayName: string
  notifications: DashboardNotification[]
}

// เดิมชั่วโมงหมู่นี้ (ignition ตั้งแต่ "brief 2 / option 6a") — hero band รูปถ่ายเต็มพื้นหลัง + วง
// Fitness Score 76px — ตอนนี้ถูกแทนที่ทั้งหมดตาม "New_mobile_app.zip" (ผู้ใช้เลือก "ทำเฉพาะหน้า Home"
// ให้ตรงกับทิศทางใหม่นี้แทน) สเปกใหม่ไม่มี hero photo/ring เลย เหลือแค่แถวโลโก้+กระดิ่งเรียบๆ ด้านบน
// แล้วตามด้วยบล็อกทักทาย (คำทักทาย/ชื่อผู้ใช้ตัวใหญ่/tagline สีส้มตัวเอียง) — Greeting.tsx เดิม (แค่
// "👋 {text}" บรรทัดเดียว) ไม่พอสำหรับโครงสร้าง 3 บรรทัดใหม่นี้ เลยเลิกใช้ไฟล์นั้น (mobile-only,
// ไม่กระทบที่อื่น) รวมเนื้อหาไว้ในไฟล์นี้ตรงๆ แทน
//
// displayName: ชื่อผู้ใช้จริง (data.profileDisplayName || emailDisplayName(data.email) — สูตรเดียวกับ
// ที่เดสก์ท็อปใช้อยู่แล้ว ดู DashboardView.tsx บรรทัด ~1230) — ไม่เคยโชว์ตัวใหญ่แบบนี้ในมือถือมาก่อนตั้งแต่
// รอบ "Version 5" rebuild (ตอนนั้นตัดออกเพราะเปลี่ยนไปเน้นวง Fitness Score แทน) กลับมาอีกครั้งตามสเปกนี้
function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="#0a0d12" />
    </svg>
  )
}

export default function Header({ greetingText, displayName, notifications }: HeaderProps) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
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

      <div style={{ marginBottom: 20 }}>
        <p className="font-homeTh" style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginBottom: 2 }}>
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
  )
}
