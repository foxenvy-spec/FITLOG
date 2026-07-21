import BottomNav from '@/components/BottomNav'
import QueryProvider from '@/components/QueryProvider'
import { WeightUnitProvider } from '@/components/WeightUnitProvider'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // header เหลือแค่โลโก้ + ทางลัดไปโปรไฟล์ — อีเมล/หน่วยน้ำหนัก/ปุ่มออกจากระบบ
  // ย้ายไปรวมอยู่ที่หน้า /profile ทั้งหมดแล้ว เพื่อให้แต่ละหน้ามีหน้าที่ชัดเจนขึ้น
  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <WeightUnitProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line safe-top">
          <div className="max-w-sm mx-auto flex items-center justify-between px-5 py-3.5">
            <a href="/dashboard" className="font-display tracked-lg uppercase text-lg text-ink">FITLOG</a>
            <a
              href="/profile"
              aria-label="โปรไฟล์"
              className="shrink-0 w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center font-display text-xs tracked uppercase text-amber"
            >
              {initial}
            </a>
          </div>
        </header>

        <main className="flex-1 max-w-sm w-full mx-auto px-5 pt-5 pb-24">
          <QueryProvider>{children}</QueryProvider>
        </main>

        <BottomNav />
      </div>
    </WeightUnitProvider>
  )
}
