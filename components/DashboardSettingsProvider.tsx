'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// การ์ด "ตั้งค่า Dashboard" (DashboardSettings modal) เดิมเปิดได้จากไอคอนเฟืองที่หน้า Dashboard
// เท่านั้น (state เป็น local ของ DashboardView) — ย้ายปุ่มเปิดมาไว้ที่ท้าย Sidebar (ตำแหน่งเดียวกับ
// "ตั้งค่า" ทั่วไป) ซึ่งเป็น layout ระดับบนสุดที่ทุกหน้าเห็นร่วมกัน จึงต้องยก state ขึ้นมาไว้ใน
// context ตัวนี้แทน ให้ทั้ง Sidebar (ปุ่มเปิด) และ DashboardView (ตัว modal จริง) ใช้ร่วมกันได้
interface DashboardSettingsContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}

const DashboardSettingsContext = createContext<DashboardSettingsContextValue | null>(null)

export function DashboardSettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <DashboardSettingsContext.Provider value={{ open, setOpen }}>{children}</DashboardSettingsContext.Provider>
  )
}

export function useDashboardSettings() {
  const ctx = useContext(DashboardSettingsContext)
  if (!ctx) throw new Error('useDashboardSettings must be used within DashboardSettingsProvider')
  return ctx
}
