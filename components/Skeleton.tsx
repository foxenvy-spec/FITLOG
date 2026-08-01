import type { CSSProperties } from 'react'

// skeleton-shimmer (globals.css) แทน Tailwind animate-pulse เดิม (opacity หายใจเข้า-ออกเฉยๆ) — เปลี่ยน
// เป็นแถบสว่างจางๆ กวาดผ่านซ้าย→ขวาต่อเนื่อง (แบบ Apple/native skeleton) ให้ดูพรีเมียมสอดคล้องกับผิว
// โลหะของการ์ดจริงที่โหลดเสร็จแล้วมากกว่า — ใช้ทั่วทั้งแอป (ไม่ใช่แค่ dashboard) เพราะเป็นแค่การอัปเกรด
// placeholder box เฉยๆ ไม่เปลี่ยนพฤติกรรม/โครงสร้างของหน้าไหนเลย
export default function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton-shimmer rounded bg-surface2 ${className}`} style={style} />
}
