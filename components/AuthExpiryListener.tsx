'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './Toast'
import { AUTH_EXPIRED_MESSAGE, consumeIntentionalSignOut } from '@/lib/authError'

// Auth Expiry Handling v1 (Option 2, LOCKED) — global layer: mount ครั้งเดียวที่ app/(app)/layout.tsx
// (เหมือน CommandPalette — render null เสมอ ไม่มี UI ของตัวเอง) ฟัง onAuthStateChange() ตรงๆ แทนการเดา
// จาก error message ของแต่ละ write (Supabase client ยิง SIGNED_OUT เองอัตโนมัติเมื่อ refresh token
// ใช้ไม่ได้แล้ว ไม่ต้อง string-match error กระจายทุกจุดทั่วแอปตามที่ trace เตือนไว้ว่าไม่ scale) —
// ไม่แตะ write semantics/persistence ใดๆ เลย เป็นคนละ concern จาก session/page.tsx's friendly message
// (ดู lib/authError.ts's isAuthError())
//
// SIGNED_OUT ยิงทั้งตอน session หมดอายุจริงๆ และตอนผู้ใช้กด "ออกจากระบบ" เอง (SignOutButton) — เคสหลัง
// ไม่ควรเห็นข้อความ "เซสชันหมดอายุ" ซ้ำกับ redirect ที่ SignOutButton ทำเองอยู่แล้ว consumeIntentionalSignOut()
// แยกสองเคสนี้ออกจากกัน (ดู lib/authError.ts)
export default function AuthExpiryListener() {
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      if (consumeIntentionalSignOut()) return
      showToast(AUTH_EXPIRED_MESSAGE, 'error')
      router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [router, showToast])

  return null
}
