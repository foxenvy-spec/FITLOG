import BottomNav from '@/components/BottomNav'
import SidebarNav from '@/components/SidebarNav'
import QueryProvider from '@/components/QueryProvider'
import { WeightUnitProvider } from '@/components/WeightUnitProvider'
import { ToastProvider } from '@/components/Toast'
import { DashboardSettingsProvider } from '@/components/DashboardSettingsProvider'
import CommandPalette from '@/components/CommandPalette'

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
        {/* QueryProvider ย้ายมาห่อทั้ง SidebarNav/BottomNav ด้วย (เดิมห่อแค่ {children} ใน <main>) —
            BottomNav.tsx อ่าน isRestDay จาก useQuery(['dashboard', today]) ตอนนี้ (ดู BottomNav.tsx)
            ถ้าไม่มี QueryClientProvider ครอบ จะพัง "No QueryClient set" ตอน static prerender ทุกหน้า
            (BottomNav render อยู่ทุก route ใน layout นี้) — ย้ายขึ้นมาระดับนี้จุดเดียว ครอบทั้ง
            SidebarNav/main/BottomNav ด้วย client ตัวเดียวกัน ไม่กระทบพฤติกรรมเดิมของ {children}
            (ยังได้ client ตัวเดียวกันเป๊ะ แค่ scope กว้างขึ้น) — comment เดิมใน SidebarNav.tsx ที่บอกว่า
            "อยู่นอก QueryProvider" ไม่จริงอีกต่อไปหลังจากนี้ แต่ตัว SidebarNav เองยังไม่ได้ย้ายไปใช้
            react-query (ไม่ได้ขอ ไม่แตะ) */}
        <QueryProvider>
        <div className="min-h-screen flex lg:flex-row">
          <DashboardSettingsProvider>
          {/* ฟีดแบ็ก "One-Click Export PDF Report" — เมนูนำทาง (sidebar/bottom nav) ไม่มีความหมายใน
              รายงานที่พิมพ์/บันทึกเป็น PDF เลย ซ่อนด้วย print:hidden (Tailwind print variant มาตรฐาน
              ไม่ต้องเขียน CSS แยก) ทั้งสองส่วน ให้ report เหลือแค่เนื้อหาจริงเต็มหน้า */}
          <div className="print:hidden contents">
            <SidebarNav />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {/* safe-top ย้ายมาไว้ที่ main แทน (เดิมอยู่ที่ header ที่เพิ่งตัดออก) กัน status
                bar/notch บนมือถือทับเนื้อหาบนสุด — env(safe-area-inset-top) เป็น 0 บนเดสก์ท็อป
                ทั่วไปอยู่แล้ว จึงไม่กระทบเดสก์ท็อป */}
            <main className="flex-1 w-full max-w-sm md:max-w-2xl mx-auto lg:max-w-none lg:mx-0 px-5 lg:px-6 pt-5 pb-safe-bottom-nav lg:pb-10 safe-top">
              {children}
            </main>

            <div className="print:hidden contents">
              <BottomNav />
            </div>
          </div>
          </DashboardSettingsProvider>
        </div>
        {/* ฟีดแบ็ก "Power-User Feature — Ctrl+K/Cmd+K แถบค้นหาเร็ว" — mount ระดับ layout นี้ (ไม่ใช่แค่
            หน้า Dashboard) ให้ shortcut ใช้ได้จากทุกหน้าในแอป ตัว component เองจัดการ event listener/
            modal ทั้งหมดในตัว render null ตอนปิดอยู่ (ไม่มี DOM ค้างตอนไม่ได้ใช้) */}
        <CommandPalette />
        </QueryProvider>
      </ToastProvider>
    </WeightUnitProvider>
  )
}
