'use client'

interface GreetingProps {
  text: string
}

// ข้อความทักทายบนสุดของ header (เปลี่ยนตามช่วงเวลาของวัน, ดู lib/dashboardStats.ts)
//
// v3: กระดิ่งแจ้งเตือนแยกออกไปวางตำแหน่ง absolute เองใน Header.tsx แล้ว (ตามสเปก mockup ที่
// กำหนด top/right ของ greeting กับ bell ไว้ต่างกันคนละจุด ไม่ใช่แถวเดียวกันแบบ flex justify-between
// เหมือนเวอร์ชันก่อน) — Greeting จึงเหลือแค่ข้อความล้วนๆ
export default function Greeting({ text }: GreetingProps) {
  return <p className="text-xs text-muted">👋 {text}</p>
}
