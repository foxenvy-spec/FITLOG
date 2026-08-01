'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { FIRE_GRADIENT_STOPS, NEUTRAL } from '@/lib/theme'

interface GradientStop {
  offset: string
  color: string
}

interface FitnessRingProps {
  /** 0-100 */
  value: number
  size?: number
  strokeWidth?: number
  trackColor?: string
  /** ไล่สีของเส้นวง — ดีฟอลต์เป็น fire theme คงที่ (FIRE_GRADIENT_STOPS) ถ้าไม่ส่งมา แต่ FitnessScore.tsx
   *  จะส่ง gradientStops ของ tier ปัจจุบันมาเสมอ (ดู lib/fitnessScore.ts) ให้สีวงเปลี่ยนตามคะแนนจริง */
  gradientStops?: readonly GradientStop[]
  /** เนื้อหากึ่งกลางวง (เช่น ตัวเลข + label) */
  children?: ReactNode
  className?: string
}

// FitnessRing — v4: เพิ่มความ "หนาของวัสดุ" กลับมาตามฟีดแบ็ก (v3 ที่พอร์ตตรงจาก reference มา
// เรียบง่ายเกินไป ยังดูเป็นแค่ arc + glow ไม่มีมิติผิวจริง) โครงสร้างตอนนี้: วงพื้นหลัง (track) →
// วง glow ชั้นนอก (เส้นหนากว่า เบลอนุ่ม opacity ต่ำ) → วงคะแนนหลัก (bloom filter จริง ไม่ใช่แค่เบลอแคบ
// เฉยๆ) → glossy reflection rim (เส้นบางสว่างจ้าแนบผิวด้านในของวงหลัก จำลองผิวมันวาว) → highlight arc
// สั้นๆ ตรงด้านบนสุด (จำลองแสงสะท้อนจากด้านบน แบบวัสดุทรงกลม) → จุดปลาย (tip) ที่หายใจเบาๆ
//
// สี gradient เปลี่ยนตาม tier ของ Fitness Score แล้ว (เดิมคงที่เป็น fire theme เสมอ — ดูคอมเมนต์ที่
// อัปเดตแล้วใน lib/theme.ts) ส่วนแสง glow รอบวงที่ Header.tsx ห่ออยู่รอบนอก component นี้ ก็เปลี่ยนไป
// ใช้สีเดียวกับ tier แล้วเหมือนกัน (fitnessScore.color) ไม่ใช่สถานะ recovery แยกต่างหากเหมือนเดิมอีกต่อไป
export default function FitnessRing({
  value,
  size = 84,
  strokeWidth,
  trackColor = NEUTRAL.ringTrackWarm,
  gradientStops = FIRE_GRADIENT_STOPS,
  children,
  className = '',
}: FitnessRingProps) {
  const sw = strokeWidth ?? Math.round(size * 0.08)
  const radius = (size - sw) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const dashOffset = circumference * (1 - clamped / 100)
  const rawId = useId()
  const idPrefix = `fr-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`

  // ตำแหน่งจุด tip — พารามิเตอร์มุมเดียวกับที่ strokeDasharray/strokeDashoffset วาดเส้นจริง (เริ่มที่ 3
  // นาฬิกาแล้วหมุน -90deg ให้ไปเริ่มที่ 12 นาฬิกาแทน) ลบ 90deg ออกจากมุม raw ให้ตรงกับตำแหน่งที่ตาเห็นจริง
  const rawAngleRad = (clamped / 100) * 2 * Math.PI
  const tipAngle = rawAngleRad - Math.PI / 2
  const tipX = size / 2 + radius * Math.cos(tipAngle)
  const tipY = size / 2 + radius * Math.sin(tipAngle)

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <filter id={`${idPrefix}-glow-soft`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={Math.max(2, sw * 0.5)} />
          </filter>
          {/* bloom บนเส้นคะแนนหลัก — เบลอแล้วดันความสว่าง (feColorMatrix) ก่อน merge กลับเข้า source
              ให้แสงฟุ้งจ้าแบบ "bloom" จริงๆ แทนที่จะเป็นแค่เบลอแคบธรรมดา (glow-tight เดิม) ซึ่งดูแบน
              เกินไปสำหรับวัสดุที่ควรมีความหนา */}
          <filter id={`${idPrefix}-bloom`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={Math.max(1, sw * 0.18)} result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1.3 0 0 0 0  0 1.3 0 0 0  0 0 1.3 0 0  0 0 0 1 0" result="brightBlur" />
            <feMerge>
              <feMergeNode in="brightBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`${idPrefix}-ring-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradientStops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
          {/* ไล่สีวงพื้นหลัง (track) แบบโลหะขัดเงา (brushed titanium) — เดิมเป็นสีเดียวแบนๆ (trackColor)
              ทำให้อ่านออกว่าเป็นแค่ "แถบ progress bar" ไม่ใช่วงแหวนโลหะจริง สลับสว่าง/มืดหลาย stop
              แนวทแยงจำลองแสงตกกระทบผิวโค้งไม่สม่ำเสมอแบบโลหะจริง (เทียบภาพอ้างอิง) — ทิศทางคงที่
              (ไม่หมุนตาม progress) ให้ความรู้สึกเป็นวัสดุจริงที่มีอยู่ก่อนคะแนนจะวาดทับ
              v3: เพิ่มจาก 4 เป็น 5 สต็อป (silver→gray→เกือบดำ→gray→silver) ให้มี highlight/midtone/
              shadow/reflection ครบใน "วงเดียว" ตามที่ขอ ไม่ใช่แค่ไล่ทางเดียวจากสว่างไปมืด — เพิ่ม opacity
              จาก 0.85 เป็น 0.95 ให้ contrast โลหะเด่นชัดขึ้น (ยังไม่ถึง 1 เพื่อให้ trackColor เบสด้านล่าง
              ยังช่วยกันวงคะแนนสีสดด้านหน้าไม่ให้กลืนไปกับพื้นหลัง) */}
          <linearGradient id={`${idPrefix}-titanium-track`} x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#F2F2F2" />
            <stop offset="25%" stopColor="#7D7D80" />
            <stop offset="50%" stopColor="#2B2B2C" />
            <stop offset="75%" stopColor="#7D7D80" />
            <stop offset="100%" stopColor="#BEBEBE" />
          </linearGradient>
        </defs>

        {/* วงพื้นหลัง — เบสสีเข้มทึบก่อน แล้วค่อยวาดไล่สีโลหะทับอีกชั้น (opacity <1) ให้ยังอ่าน
            ตัดกับวงคะแนนสีสดด้านหน้าได้ชัดเจน ไม่สว่างจนแย่งซีน */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-titanium-track)`}
          strokeWidth={sw}
          opacity={0.95}
        />

        {/* วง track เดิมมีแค่ไล่สีทแยงเส้นเดียว ยัง "สะอาด/แบน" เกินไป — เพิ่มส่วนโค้งนิ่ง (ไม่ผูกกับ
            progress เหมือนจุดอื่นในไฟล์นี้) จำลอง highlight สว่าง 2 จุดที่ 11 กับ 5 นาฬิกา (ตำแหน่งตรง
            ข้ามกันบนวงกลม, กว้างจุดละ ~10% ของเส้นรอบวง) + shadow มืดด้านล่างขวา ให้วง track เองมี
            reflection/highlight/micro-shadow ในตัวจริงๆ แทนที่จะพึ่งแค่ linearGradient เส้นเดียว — ไม่มี
            filter/blur ทั้งคู่ (แค่ stroke-opacity ธรรมดา) ไม่นับเป็น glow ใหม่ตามที่ขอให้หยุดเพิ่ม

            บั๊กรอบก่อน: 3 วงนี้ลืมใส่ transform rotate(-90) เหมือนวงอื่นๆ ในไฟล์นี้ (ring-glow/ring-progress/
            reflection rim/highlight arc ด้านล่างทุกวงมี) ทำให้คำนวณตำแหน่งนาฬิกาโดยอิงกรอบอ้างอิงผิด (คิด
            ว่า s=0 คือ 12 นาฬิกา แต่จริงๆ ไม่หมุนเลยจึงยังเป็น 3 นาฬิกาแบบ default SVG circle) ผลคือ
            highlight ที่ตั้งใจไว้ 11/5 นาฬิกาไปโผล่ที่ ~2/~8 นาฬิกาแทน — เพิ่ม transform เดียวกับวงอื่น
            ให้กรอบอ้างอิงตรงกัน สูตร dashOffset เดิม (คำนวณสำหรับกรอบหลังหมุนอยู่แล้ว) ใช้ได้เลยไม่ต้องแก้ */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={Math.max(1, sw * 0.22)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.1} ${circumference * 0.9}`}
          strokeDashoffset={circumference * 0.1333}
          strokeOpacity={0.26}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ mixBlendMode: 'screen' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={Math.max(1, sw * 0.22)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.1} ${circumference * 0.9}`}
          strokeDashoffset={circumference * 0.6333}
          strokeOpacity={0.24}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ mixBlendMode: 'screen' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#000000"
          strokeWidth={Math.max(1, sw * 0.28)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.18} ${circumference * 0.82}`}
          strokeDashoffset={circumference * 0.58}
          strokeOpacity={0.28}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />

        {/* ring-glow — เส้นหนากว่าเส้นหลัก เบลอนุ่ม (glow-soft) opacity ต่ำ ให้แสงแผ่ออกรอบวงเป็น
            บรรยากาศ (ambient) อยู่ข้างหลังเส้นคะแนนหลัก */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-ring-gradient)`}
          strokeWidth={sw * 1.3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-glow-soft)`}
          opacity={0.7}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />

        {/* ring-progress — เส้นคะแนนหลัก ใช้ bloom filter จริง (เบลอ+ดันสว่างก่อน merge กลับ source)
            แทน glow-tight เดิม ให้ผิวเส้นดูมีความหนา/สว่างจ้าเป็นวัสดุจริง ไม่ใช่แค่เส้นแบนมีเงาบางๆ */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-ring-gradient)`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          filter={`url(#${idPrefix}-bloom)`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />

        {/* glossy reflection rim — เส้นบางสว่างจ้าเกือบขาว แนบผิวด้านในของวงหลัก จำลองผิวมันวาว/สะท้อน
            แสง (เหมือนวัสดุทรงกลมจริงๆ ไม่ใช่แค่เส้น flat) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - sw * 0.3}
          fill="none"
          stroke="#FFF4CC"
          strokeWidth={Math.max(1, sw * 0.14)}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeOpacity={0.65}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ mixBlendMode: 'screen', transition: 'stroke-dashoffset 0.9s cubic-bezier(.22,.9,.32,1)' }}
        />

        {/* highlight arc — ส่วนโค้งสั้นๆ สว่างจ้าตรงด้านบนสุด (12 นาฬิกา) จำลองแสงตกกระทบจากด้านบนแบบ
            วัสดุทรงกลมมันวาว (glossy sphere) แยกจาก reflection rim ที่แนบตลอดทั้งวง — อันนี้แค่ส่วนเล็กๆ
            ด้านบนเท่านั้น ให้ความรู้สึก "แสงตกกระทบจุดเดียว" ไม่ใช่แสงรอบวงสม่ำเสมอ */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={Math.max(1, sw * 0.2)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.14} ${circumference * 0.86}`}
          strokeDashoffset={circumference * 0.07}
          strokeOpacity={0.55}
          filter={`url(#${idPrefix}-glow-soft)`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ mixBlendMode: 'screen' }}
        />
      </svg>

      {/* light sweep — highlight ขาว/เงินจางๆ กวาดวนรอบวงช้าๆ (9s/รอบ, animate-ring-sweep-slow ใน
          globals.css) จำลองแสงสะท้อนเคลื่อนผ่านผิวโลหะเป็นระยะๆ (ไม่ใช่ไฟพลังงานแบบ ProgressRing ที่ใช้
          animate-ring-sweep 4s + จุดสีครีม/ส้ม) — ไม่มี boxShadow/blur เพิ่ม กันไม่ให้กลายเป็น glow ใหม่
          ตามที่ขอให้หยุดเพิ่ม แค่วงกลมทึบจางๆ ผสม screen blend เท่านั้น ปิดอัตโนมัติเมื่อ
          prefers-reduced-motion (ดู .animate-ring-sweep-slow ใน globals.css) */}
      <div className="absolute inset-0 pointer-events-none animate-ring-sweep-slow" aria-hidden="true">
        <div
          className="absolute rounded-full"
          style={{
            width: Math.max(3, sw * 0.45),
            height: Math.max(3, sw * 0.45),
            left: '50%',
            top: sw / 2,
            transform: 'translate(-50%, -50%)',
            background: '#FFFFFF',
            opacity: 0.3,
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* ring-tip — จุดสว่างนิ่งตรงตำแหน่ง progress ปัจจุบัน หายใจ (scale) เบาๆ แทนวงหมุนรอบต่อเนื่อง */}
      {clamped > 1 && (
        <span
          className="absolute rounded-full animate-ring-tip-pulse"
          style={{
            width: Math.max(3, sw * 0.7),
            height: Math.max(3, sw * 0.7),
            left: tipX,
            top: tipY,
            // fallback ตำแหน่งกึ่งกลางเวลา prefers-reduced-motion ปิด animation (keyframe
            // ring-tip-pulse เองก็ตั้งค่านี้ซ้ำอยู่แล้วตอน animation ทำงานปกติ — จำเป็นต้องมีทั้งคู่
            // เพราะพอ animation ถูกปิดด้วย `animation: none`, transform จาก keyframe หายไปด้วย)
            transform: 'translate(-50%, -50%)',
            background: '#FFF4CC',
            boxShadow: '0 0 6px #FFF4CC, 0 0 12px #FF8A00',
          }}
        />
      )}

      {/* inner shadow บางๆ ด้านในวง ให้เนื้อหากึ่งกลางดูจมลงไปนิดหนึ่งแทนที่จะลอยแบน */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: sw, boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
