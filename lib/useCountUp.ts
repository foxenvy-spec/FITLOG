'use client'

import { useEffect, useRef, useState } from 'react'

// นับเลขไต่จาก 0 (หรือค่าก่อนหน้า) ไปหาค่าเป้าหมาย ใช้ easing แบบ ease-out ให้เริ่มไวแล้วชะลอตอนใกล้ถึง
// เหมาะกับตัวเลข % หรือสถิติที่อยากให้รู้สึก "มีชีวิต" ตอนโหลดหน้า แทนที่จะโผล่มานิ่งๆ ทันที
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const delta = target - from
    if (delta === 0) return

    let rafId = 0
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      const current = from + delta * eased
      setValue(current)
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}
