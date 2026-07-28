'use client'

interface AmbientGlowProps {
  color: string
}

// พื้นหลังตกแต่งของ header หน้า dashboard (มือถือ) — วง glow เบลอนุ่มๆ + จุด particle ลอยเบาๆ
// อยู่หลังเนื้อหาจริงทั้งหมด (ทักทาย/ชื่อ/วงแหวนคะแนน) ไม่ใช่ข้อมูล จึงเป็น aria-hidden และ
// pointer-events-none ทั้งชั้น — สีของ glow/particle ผูกกับสีของ Fitness Score tier ปัจจุบัน
// เหมือนกับเส้นคลื่น (AnimatedWave) ให้ทั้งชั้นพื้นหลังรู้สึกเชื่อมโยงกัน
//
// โครงสร้างนี้เทียบเท่ากับแนวคิด Stack(Glow, Particle, Wave, Content) ของ Flutter — แต่ implement
// ด้วย CSS ธรรมดา (absolute positioning + @keyframes ใน globals.css) ไม่ต้องพึ่ง library ภายนอก
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
      {/* glow blob — วางค่อนไปทางขวาบน ใกล้บริเวณวงแหวนคะแนน ให้ความรู้สึกเป็นแหล่งกำเนิดแสง */}
      <div
        className="absolute rounded-full animate-header-glow"
        style={{
          width: 200,
          height: 110,
          top: -20,
          right: -10,
          background: color,
          filter: 'blur(36px)',
        }}
      />
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
