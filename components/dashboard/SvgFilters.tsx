'use client'

interface SvgFiltersProps {
  idPrefix: string
}

// รวม filter/gradient ที่ใช้ร่วมกันของ SVG ตกแต่ง header (HeroEnergyWave เป็นตัวใช้หลัก) — วางเป็น
// <defs> เดียว inject เข้า SVG ที่เรียกใช้ ผ่าน idPrefix กัน id ชนกันเวลามีหลาย instance บนหน้าเดียวกัน
// แทนที่จะก็อปโค้ด filter เดิมซ้ำทุกไฟล์ (เดิม AnimatedWave.tsx ประกาศ filter ของตัวเองแยกต่างหาก)
export default function SvgFilters({ idPrefix }: SvgFiltersProps) {
  return (
    <defs>
      {/* glow ฟุ้งมาตรฐาน — ใช้กับเส้น/จุดที่อยากให้เรืองแสงรอบตัวแบบพอดีๆ ไม่กว้างมาก */}
      <filter id={`${idPrefix}-glow-soft`} x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${idPrefix}-glow-wide`} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="14" />
      </filter>

      {/* glow แบบ "hug เส้น" — stdDeviation เล็กมาก ให้แสงเรืองแนบไปกับรูปทรงเส้นจริงๆ (เห็นเป็นเงา
          เรืองรอบ stroke บางๆ) แทนที่จะเบลอกว้างจนพื้นที่รอบเส้นรวมกันเป็นก้อนทึบ (blob) ไม่เห็นรูปทรง
          เส้นเดิมอีกต่อไป — ใช้กับ Glow Wave ของ HeroEnergyWave โดยเฉพาะ */}
      <filter id={`${idPrefix}-glow-tight`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>

      {/* bloom — เบลอแล้วดันความสว่าง (feColorMatrix) ก่อน merge กลับเข้า source ให้แสงฟุ้งจ้าแบบ
          "bloom" จริงๆ ไม่ใช่แค่เบลอเดี่ยวๆ เหมือน glow-soft ด้านบน */}
      <filter id={`${idPrefix}-bloom`} x="-150%" y="-150%" width="400%" height="400%">
        <feGaussianBlur stdDeviation="9" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1.4 0 0 0 0  0 1.4 0 0 0  0 0 1.4 0 0  0 0 0 1 0"
          result="brightBlur"
        />
        <feMerge>
          <feMergeNode in="brightBlur" />
          <feMergeNode in="brightBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* gradient ไฟหลัก พร้อมแอนิเมชันไล่สีวนต่อเนื่อง (Orange → Amber → Yellow → Orange) ผ่าน
          animateTransform บน gradientTransform — เลื่อน gradient ไปมาตามแนวนอนซ้ำๆ ให้ดูเหมือนแสง
          "ไหล" ไปตามเส้นเอง โดยไม่ต้องพึ่ง JS/requestAnimationFrame เลย */}
      <linearGradient id={`${idPrefix}-flow-gradient`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#D96A00" />
        <stop offset="25%" stopColor="#FF8A00" />
        <stop offset="50%" stopColor="#FFD166" />
        <stop offset="75%" stopColor="#FF8A00" />
        <stop offset="100%" stopColor="#D96A00" />
        <animateTransform
          attributeName="gradientTransform"
          type="translate"
          values="-0.4 0; 0.4 0; -0.4 0"
          dur="9s"
          repeatCount="indefinite"
        />
      </linearGradient>

      {/* radial glow — ใช้เป็นพื้นหลังเรืองแสงกลมๆ ฟุ้งจากจุดศูนย์กลางออกไปโปร่งใส (เช่น หลังวง
          Fitness Score หรือจุด lens flare) แยกจาก glow-wide/glow-tight ที่เป็น filter (เบลอของทรง
          ที่มีอยู่แล้ว) — อันนี้เป็น fill โดยตรง ไม่ต้องมี shape อื่นมาก่อน */}
      <radialGradient id={`${idPrefix}-radial-glow`}>
        <stop offset="0%" stopColor="#FFF4CC" stopOpacity="0.9" />
        <stop offset="40%" stopColor="#FF8A00" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#FF8A00" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}
