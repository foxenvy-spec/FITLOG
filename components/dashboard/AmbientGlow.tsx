'use client'

import Glow from '@/components/ui/Glow'

interface AmbientGlowProps {
  color: string
}

// พื้นหลังตกแต่งของ header หน้า dashboard (มือถือ) — วง glow เบลอนุ่มๆ (ใช้ Glow primitive จาก
// components/ui/ แทนที่จะเขียน div+style ตรงๆ แบบเดิม) + จุด particle ลอยเบาๆ อยู่หลังเนื้อหาจริง
// ทั้งหมด (ทักทาย/ชื่อ/วงแหวนคะแนน) ไม่ใช่ข้อมูล จึงเป็น aria-hidden และ pointer-events-none ทั้งชั้น
// สีของ glow/particle ผูกกับสีของ Fitness Score tier ปัจจุบัน
export default function AmbientGlow({ color }: AmbientGlowProps) {
  const particles = [
    { left: '18%', top: '15%', size: 3, delay: '0s' },
    { left: '38%', top: '55%', size: 2, delay: '0.6s' },
    { left: '58%', top: '20%', size: 3, delay: '1.2s' },
    { left: '72%', top: '60%', size: 2, delay: '1.8s' },
    { left: '85%', top: '30%', size: 2, delay: '2.4s' },
    { left: '28%', top: '75%', size: 2, delay: '3s' },
  ]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Glow color={color} width={200} height={110} top={-20} right={-10} blur={36} opacity={0.16} pulse />
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-header-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: color,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  )
}
