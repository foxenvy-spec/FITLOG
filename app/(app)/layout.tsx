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
            {/* บั๊ก (ฟีดแบ็ก "บน iPhone 14 Pro Max ทำไมไม่เต็มจอ") "max-w-sm (384px) ครอบ <main> ตั้งแต่
                0px ถึง md (768px) — ช่วงนี้ครอบคลุมมือถือจริงแทบทุกรุ่นด้วย ไม่ใช่แค่หน้าต่างเดสก์ท็อปแคบๆ
                ตามที่ตั้งใจ (iPhone 14/15/16 ธรรมดา/Pro กว้าง 390-393px ก็เกิน 384px แล้ว, Pro Max/Plus
                กว้างถึง 430px — ส่วนเกินทั้งหมดกลายเป็นแถบดำว่างซ้าย-ขวานอกเหนือจาก px-5 gutter ปกติ ยิ่งจอ
                กว้างยิ่งเห็นชัด)" — ใช้สกิล ui-ux-pro-max ยืนยัน pattern ที่ถูกต้อง (mobile-first: bucket
                เริ่มต้นควร fluid เต็มความกว้าง เพิ่ม max-width center-constraint เฉพาะ breakpoint tablet/
                desktop จริงขึ้นไป, ทดสอบช่วงมือถือจริงที่ 320-414 ก่อนถึง 768) — ตัด max-w-sm ออก เหลือแค่
                w-full ที่ bucket มือถือ (0-767px) ให้เนื้อหาเต็มความกว้างจอจริงเสมอ (คุมด้วย px-5 อย่างเดียว
                เหมือนที่ comment ด้านบนของไฟล์นี้ตั้งใจไว้แต่แรก — "< 768px: single column" ไม่เคยพูดถึงการ
                จำกัดความกว้างเพิ่ม) — md:max-w-2xl/lg:max-w-none เดิมไม่แตะ ยังทำงานถูกต้องสำหรับแท็บเล็ต/
                เดสก์ท็อปเหมือนเดิมทุกจุด */}
            {/* v2: ฟีดแบ็ก "อยากได้ความรู้สึกเต็มจอมากขึ้นแบบ poster" — ลด gutter มือถือจาก px-5 (20px)
                เหลือ px-4 (16px) ยังห่างจากขอบจอพอสำหรับ iOS edge-swipe gesture (ไม่ชิดขอบจนกดพลาด/
                สไลด์ย้อนกลับโดยไม่ตั้งใจ) ไม่แตะ lg:px-6 (เดสก์ท็อป มี sidebar คนละ layout ไม่เกี่ยวกัน) */}
            <main className="flex-1 w-full md:max-w-2xl mx-auto lg:max-w-none lg:mx-0 px-4 lg:px-6 pt-5 pb-safe-bottom-nav lg:pb-10 safe-top">
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
