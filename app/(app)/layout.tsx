import BottomNav from '@/components/BottomNav'
import SidebarNav from '@/components/SidebarNav'
import QueryProvider from '@/components/QueryProvider'
import { WeightUnitProvider } from '@/components/WeightUnitProvider'
import { ToastProvider } from '@/components/Toast'
import { DashboardSettingsProvider } from '@/components/DashboardSettingsProvider'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WeightUnitProvider>
      <ToastProvider>
        {/* < 768px: single column, bottom tab bar only (ตัด header โลโก้+avatar ออกแล้ว — ทุกหน้ามี
          page title ของตัวเองอยู่แล้ว และ /profile เข้าถึงได้จากแท็บ bottom nav อยู่แล้ว การมี
          header ลอยซ้ำทุกหน้าจึงไม่จำเป็น ตัดออกให้ดูโล่ง/พรีเมียมขึ้นแบบ Apple Health/Whoop).
          768–1023px: same shell, just a wider centered column so cards can sit two-across
          instead of stretching one narrow strip across a tablet screen.
          >= 1024px: sidebar replaces the header + bottom bar entirely; content gets the
          remaining width to lay out as a multi-column dashboard. (ไม่กระทบส่วนนี้เลย — header
          เดิมเป็น lg:hidden อยู่แล้ว desktop ไม่เคยเห็น มีแต่ SidebarNav) */}
        <div className="min-h-screen flex lg:flex-row">
          <DashboardSettingsProvider>
          <SidebarNav />

          <div className="flex-1 flex flex-col min-w-0">
            {/* safe-top ย้ายมาไว้ที่ main แทน (เดิมอยู่ที่ header ที่เพิ่งตัดออก) กัน status
                bar/notch บนมือถือทับเนื้อหาบนสุด — env(safe-area-inset-top) เป็น 0 บนเดสก์ท็อป
                ทั่วไปอยู่แล้ว จึงไม่กระทบเดสก์ท็อป */}
            <main className="flex-1 w-full max-w-sm md:max-w-2xl mx-auto lg:max-w-none lg:mx-0 px-5 lg:px-6 pt-5 pb-safe-bottom-nav lg:pb-10 safe-top">
              <QueryProvider>{children}</QueryProvider>
            </main>

            <BottomNav />
          </div>
          </DashboardSettingsProvider>
        </div>
      </ToastProvider>
    </WeightUnitProvider>
  )
}
