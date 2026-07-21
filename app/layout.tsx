import type { Metadata, Viewport } from 'next'
import './globals.css'

// นี่คือ ROOT layout ของทั้งแอป (ต้องมี <html>/<body> เสมอ — Next.js บังคับ)
// ห้ามลบ/ทับด้วยเนื้อหาของ app/(app)/layout.tsx อีก เพราะจะทำให้หน้าเว็บพังทั้งหมด
// (ไม่มี <html>/<body>, ไม่ได้ import globals.css) — ทำให้ hydrate ไม่ได้และขึ้นจอขาว
export const metadata: Metadata = {
  title: 'FITLOG — บันทึกการออกกำลังกาย',
  description: 'จดรายละเอียดและสถิติการออกกำลังกาย เวทเทรนนิ่งและคาร์ดิโอ',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-512.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#14161A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
