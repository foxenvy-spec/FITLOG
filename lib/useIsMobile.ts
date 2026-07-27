'use client'

import { useEffect, useState } from 'react'

// เกณฑ์เดียวกับ breakpoint `lg` (1024px) ที่ใช้สลับ sidebar/bottom-nav ใน app/(app)/layout.tsx —
// ให้ dashboard ใช้จุดตัดเดียวกันทั้งแอป จะได้ไม่มีช่วงความกว้างหน้าจอที่เห็นคนละชุด UI
// (เช่น เห็น sidebar ของคอมแต่ยังโดนสลับไปการ์ดมือถือ)
const MOBILE_QUERY = '(max-width: 1023px)'

/**
 * คืนค่า `null` ก่อน mount ฝั่ง client (ยังไม่รู้ขนาดจอ — กันไม่ให้เดาผิดระหว่าง SSR),
 * แล้วค่อยเป็น true/false ตามขนาดจอจริงหลัง mount และทุกครั้งที่ resize ผ่าน breakpoint
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    setIsMobile(mql.matches)

    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
