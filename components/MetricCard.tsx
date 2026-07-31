'use client'

import Sparkline from './dashboard/Sparkline'

export type MetricIconImageKey = 'weight' | 'bodyFat' | 'muscle' | 'fatMass' | 'bmi'

// ไอคอนรูปจริงชุดเดียวกับหน้าสุขภาพ (health/page.tsx: STAT_ICON_IMAGES) แทนไอคอนเส้น SVG เดิม
// เพื่อให้การ์ดสรุปด้านบนสุดของหน้า Dashboard ใช้ภาษาภาพเดียวกับหน้าสุขภาพ
export const METRIC_ICON_IMAGES: Record<MetricIconImageKey, string> = {
  weight: '/icons/weight.png',
  bodyFat: '/icons/body-fat.png',
  muscle: '/icons/skeletal-muscle.png',
  fatMass: '/icons/fat-mass.png',
  bmi: '/icons/bmi.png',
}

export interface MetricCardTheme {
  main: string
  second: string
}

export interface MetricCardProps {
  icon: MetricIconImageKey
  label: string
  valueText: string
  deltaText: string | null
  deltaColor: string
  deltaDir: 'up' | 'down' | null
  series: number[]
  theme: MetricCardTheme
  // ข้อความ "ล่าสุด ..." บรรทัดเสริมใต้เดลต้า (ใช้เฉพาะตอนมือถือเปิด showLastMeasuredDate)
  lastMeasuredText?: string | null
  // การ์ดสูงขึ้นอีกนิด เผื่อพื้นที่บรรทัด lastMeasuredText ไม่ให้ชนกับแถวไอคอน/ป้ายชื่อด้านบน
  tall?: boolean
  // มุมโค้งการ์ด — default 'lg' (8px, เดิม) สำหรับเดสก์ท็อป, มือถือใช้ 'xl20' (20px, ดูพรีเมียมกว่า
  // ตาม design-system ที่กำหนด "Card Radius 20px") ผ่าน colorScheme="vibrant" ใน BodyMetricsRow
  radius?: 'lg' | 'xl20'
  // เฉพาะ Mobile Dashboard v2 (BodyMetricsRow colorScheme="vibrant" ส่ง compact=true ลงมา) —
  // ลด padding ลงจากเดิม ให้การ์ด "ภาพรวมร่างกาย" ดูกระชับขึ้นใน grid 2x2 บนมือถือ โดยไม่กระทบ
  // เดสก์ท็อป (DashboardView ไม่ได้ส่ง prop นี้ จึง default เป็น false เหมือนเดิมทุกประการ)
  compact?: boolean
}

function splitValueUnit(text: string): { num: string; unit: string } {
  const spaceIdx = text.indexOf(' ')
  if (spaceIdx === -1) return { num: text, unit: '' }
  return { num: text.slice(0, spaceIdx), unit: text.slice(spaceIdx + 1) }
}

// เฉพาะมือถือ (compact): แยกข้อความเดลต้าที่ BodyMetricsRow รวม "ตัวเลข + ช่วงเวลา" มาในสตริงเดียว
// (เช่น "-2.1 kg จาก 2 เดือนก่อน") ออกเป็น trend ("-2.1 kg") กับ caption ("จาก 2 เดือนก่อน") เพื่อโชว์
// คนละบรรทัด/คนละน้ำหนักตามดีไซน์ — ถ้าข้อความไม่มีคำว่า "จาก" (เช่น การ์ด BMI ที่โชว์แค่หมวดหมู่
// ไม่มีช่วงเวลาเทียบ) ให้ caption เป็น null แล้วโชว์ข้อความเดิมทั้งหมดเป็น trend บรรทัดเดียวเหมือนเดิม
function splitDeltaCaption(text: string): { trend: string; caption: string | null } {
  const idx = text.indexOf(' จาก')
  if (idx === -1) return { trend: text, caption: null }
  return { trend: text.slice(0, idx), caption: text.slice(idx + 1) }
}

// การ์ดเมตริกเดี่ยว (น้ำหนัก/ไขมัน/กล้ามเนื้อ/มวลไขมัน/BMI ฯลฯ) — สกัดออกมาจาก BodyMetricsRow
// เดิม ให้เป็น component แยกที่ reuse ได้ ต่อไปถ้าอยากมีการ์ดสไตล์เดียวกันในหน้าอื่น
// (เช่น หน้า /health) แค่เปลี่ยน props ไม่ต้องเขียน JSX/gradient/glow ใหม่ทั้งหมด
export default function MetricCard({
  icon,
  label,
  valueText,
  deltaText,
  deltaColor,
  deltaDir,
  series,
  theme,
  lastMeasuredText,
  tall = false,
  radius = 'lg',
  compact = false,
}: MetricCardProps) {
  // Mobile Dashboard v2.2: compact (มือถือ) ใช้ border-radius 24px ตาม Design Token ล่าสุด (เดิม
  // 18px) — เดสก์ท็อป (compact=false) ยังได้ 20px เหมือนเดิมทุกประการ ไม่กระทบ
  const radiusClass = radius === 'xl20' ? (compact ? 'rounded-[24px]' : 'rounded-[20px]') : 'rounded-lg'
  return (
    <>
      <div
        className={`metric-card relative overflow-hidden ${radiusClass} flex flex-col justify-between ${compact ? 'min-h-[170px]' : tall ? 'h-[138px] 2xl:h-[142px]' : 'h-[124px] 2xl:h-[128px]'}`}
        style={{
          transition: 'transform 200ms ease, filter 200ms ease, box-shadow 200ms ease', // duration 180-220ms ตามที่ขอ
          // compact: มือถือเท่านั้น (BodyMetricsRow colorScheme="vibrant") — padding 20px ตาม Design
          // Token ล่าสุด (เดิม 12px)
          padding: compact ? '20px' : '16px 18px 12px',
          border: '1.5px solid transparent',
          // 4 background ซ้อนกัน วาดถึง border-box (เพื่อทำ "ขอบไล่สี"), เรียงจากบนสุด(วาดทับ)ไปล่างสุด:
          // 1) ไล่สีเข้มพรีเมียมด้านใน + จุดสว่างจางๆ กลางการ์ด กันไม่ให้กลางการ์ดดำตันเกินไป
          //    วาดถึงแค่ padding-box (คือพื้นการ์ดจริง ทับซ่อนกลางของ 2-4 ไว้) — มือถือ (compact) ใช้เบส
          //    กลาง #161616 ตาม Color token ใหม่ (Card: #161616) แทนโทนกรมท่าเดิม (#13233A→#08121F)
          //    เดสก์ท็อป (compact=false) ยังคงโทนกรมท่าเดิมทุกประการ ไม่กระทบ
          // 2) radial glow ที่มุมซ้ายบน (สี main) 3) radial glow ที่มุมขวาล่าง (สี second)
          // 4) เข้ม→อ่อน→เข้ม แนวทแยง (แทนสีพื้นจางๆ เรียบๆ เดิม) กันไม่ให้ช่วงกลางขอบ/มุมอื่นดูเป็นเส้นแข็งทื่อ
          // ผลคือขอบเรืองแสงชัดเฉพาะ 2 มุมตรงข้ามกัน ส่วนช่วงกลางขอบก็ยังไล่เฉดนุ่มๆ ไม่ใช่เส้นตรงแข็งๆ
          backgroundImage: compact
            ? `radial-gradient(circle at 50% 55%, #1E1E1E, transparent 60%), linear-gradient(180deg, #1C1C1C, #161616), radial-gradient(120% 120% at 0% 0%, ${theme.main}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}, transparent 55%), linear-gradient(135deg, ${theme.main}14, ${theme.main}40, ${theme.main}14)`
            : `radial-gradient(circle at 50% 55%, #1B2230, transparent 60%), linear-gradient(180deg, #13233A, #08121F), radial-gradient(120% 120% at 0% 0%, ${theme.main}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}, transparent 55%), linear-gradient(135deg, ${theme.main}14, ${theme.main}40, ${theme.main}14)`,
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, padding-box, border-box, border-box, border-box',
          // 5 ชั้นซ้อนกัน: contact shadow (เงาคมใกล้ตัว) + ambient shadow (เงานุ่มฟุ้งกว้าง)
          // + inset highlight บนขอบบน (ผิวมีไฮไลต์) + glow สีธีมเยื้อง offset ไปมุมซ้ายบน/ขวาล่าง
          // (แทนที่จะเป็น 0 0 แผ่เท่ากันทุกด้าน) ให้ธีมสีเรืองแสงเฉพาะ 2 มุมตรงข้ามให้เข้ากับขอบ
          boxShadow: `0 2px 6px rgba(0,0,0,.35), 0 8px 24px 2px rgba(0,0,0,.4), inset 0 1px rgba(255,255,255,.05), -6px -6px 20px ${theme.main}33, 6px 6px 20px ${theme.second}33`,
        }}
      >
        {/* ไล่เฉด radial สีธีมจางๆ กลางค่อนไปทางบน ซ้อนอยู่หลังเนื้อหา ให้พื้นหลังดูลึกมีมิติแทนที่จะเป็น dark navy เรียบๆ */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: `radial-gradient(circle at top left, ${theme.main}14, transparent 45%)` }}
        />
        {/* ชั้นเพิ่มเติมบางเบามาก (opacity 4%) สีขาวล้วน (ไม่ใช่สีธีม) จากมุมซ้ายบน — เพิ่มมิติแบบผู้ใช้แทบไม่รู้ตัว
            แยกจากชั้นสีธีมด้านบน เพราะอันนี้ให้ความรู้สึก "แสงทั่วไป" ไม่ใช่ "แสงจากไอคอน" */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${radiusClass}`}
          style={{ backgroundImage: `radial-gradient(circle at top left, rgba(255,255,255,.03), transparent 50%)` }}
        />
        {/* จุดแสงฟุ้ง (glow blob) มุมซ้ายบน ให้ความรู้สึกมีแสงจากไอคอนกระจายเข้าไปในการ์ด — blur กว้างขึ้น + opacity ~8% ตามที่ขอ ให้ดูลึกขึ้น */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            width: 160,
            height: 160,
            left: -60,
            top: -60,
            background: theme.main,
            filter: 'blur(60px)',
            opacity: 0.08,
          }}
        />

        <div className={compact ? 'relative h-full flex flex-col justify-between' : 'relative h-full'}>
          <p
            className="flex items-center gap-2"
            style={{
              color: 'rgba(255,255,255,.94)',
              // ป้ายชื่อ Metric: มือถือ (compact) 16px ตาม Design Token ล่าสุด (Metric Label 16px,
              // เดิม 11px) — เดสก์ท็อป (compact=false) ยังคง 700/11px เดิมทุกประการ ไม่กระทบ
              fontWeight: compact ? 500 : 700,
              fontSize: compact ? 16 : 11,
            }}
          >
            <span
              className={`relative shrink-0 inline-flex items-center justify-center rounded-[10px] overflow-hidden ${compact ? 'w-[28px] h-[28px]' : 'w-[42px] h-[42px]'}`}
              style={{
                // ฐานเป็นกระจกเข้มเป็นกลาง ไล่จาก "มุมบนสว่างกว่า" ไป "มุมล่างเข้มกว่า" ชัดเจนขึ้น (180deg ตรงๆ
                // แทน 145deg เดิมที่ contrast น้อยไป) ให้ความรู้สึกกระจกโค้งแบบ Apple Vision Pro
                // + จุดสีธีมจางๆ ที่มุมบนซ้าย เป็นการ "แต้ม" สี ไม่ใช่ "ย้อม" ทั้งกล่อง
                background: `linear-gradient(180deg, #232C40, #0A0E18)`,
                backgroundImage: `radial-gradient(circle at 30% 25%, ${theme.main}55, transparent 65%), linear-gradient(180deg, #232C40, #0A0E18)`,
                // border บาง 1px สีธีม (คมชัด แทนเส้นหนาๆ) + inset highlight ลดความสว่างลง (.35→.15) ให้เป็น
                // แค่ "ผิวมัน" บางๆ ไม่ใช่เส้นขอบขาวหนา ปล่อยให้ glow ด้านนอกทำหน้าที่เน้นความเด่นแทน
                border: `1px solid ${theme.main}55`,
                boxShadow: `inset 0 1px rgba(255,255,255,.15), inset 0 -3px 6px rgba(0,0,0,.5), 0 0 15px ${theme.main}33`,
              }}
              aria-hidden="true"
            >
              {/* glass reflection: ย้ายจากแถบเต็มความกว้างด้านบน มาเป็นจุดไฮไลต์เล็กๆ แค่มุมซ้ายบน (~15-20% ของพื้นที่)
                  จำลองแสงตกกระทบจากมุมเดียวแบบของจริง แทนที่จะสว่างเท่ากันทั้งแถบบน */}
              <span
                className="pointer-events-none absolute top-0 left-0"
                style={{
                  width: '65%',
                  height: '45%',
                  background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.3), transparent 80%)',
                }}
              />
              {/* ไอคอนเดิมเป็น PNG สีเดียวล้วน — recolor ด้วย CSS mask ให้เป็น gradient สว่าง(บน)→เข้ม(ล่าง)
                  ตามสีธีมของการ์ดนั้นๆ (ไม่ได้เพิ่ม glow ใดๆ ตามที่ขอ แค่ไล่สีในตัวไอคอนเอง) */}
              <span
                className="relative block"
                style={{
                  width: compact ? 22 : 38,
                  height: compact ? 22 : 38,
                  backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${theme.main} 65%, white), color-mix(in srgb, ${theme.main} 85%, black))`,
                  WebkitMaskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  maskImage: `url(${METRIC_ICON_IMAGES[icon]})`,
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
                }}
              />
            </span>
            {label}
          </p>

          {compact ? (
            // มือถือ (compact): ตรงตามภาพอ้างอิงจริง (Image A) — value+unit+delta อยู่แถวเดียวกัน (delta
            // ชิดขวา) ต่อด้วย sparkline เต็มความกว้างเป็นแถวแยกด้านล่าง — ตัวเลข 28px (ไม่ใช่ 44/56px ตามที่
            // เคยลองก่อนหน้า เพราะ 44px ขึ้นไปทำให้ unit+delta ไม่พอที่จะอยู่แถวเดียวกันได้จริงในการ์ดกว้าง
            // ~130px) ปกติ flow ธรรมดา ปล่อยให้ flex flex-col justify-between ของ wrapper ด้านบนกระจายพื้นที่
            // เดสก์ท็อป (compact=false) ไม่กระทบ ดู branch ด้านล่าง
            <>
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-mono leading-none text-ink"
                  style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
                >
                  {splitValueUnit(valueText).num}
                  {splitValueUnit(valueText).unit && (
                    <span style={{ fontWeight: 500, fontSize: '0.5em' }}> {splitValueUnit(valueText).unit}</span>
                  )}
                </p>
                {deltaText && (
                  <p
                    className="font-semibold whitespace-nowrap flex items-center gap-1 leading-none shrink-0"
                    style={{ color: deltaColor, fontSize: 12 }}
                  >
                    {deltaDir && <span aria-hidden="true">{deltaDir === 'up' ? '↑' : '↓'}</span>}
                    {splitDeltaCaption(deltaText).trend}
                  </p>
                )}
              </div>
              {series.length >= 2 && (
                <div className="mt-2 w-full">
                  <Sparkline series={series} color={theme.main} height={24} width={200} stretch />
                </div>
              )}
            </>
          ) : (
            // เดสก์ท็อป — ไม่กระทบ เหมือนเดิมทุกประการ (position:absolute ชิดขอบล่าง, ตัวเลข+กราฟข้างกัน,
            // เดลต้าบรรทัดเดียวรวม caption ด้านล่าง)
            <div className="absolute left-0 right-0 bottom-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono leading-none text-ink" style={{ fontSize: 20, letterSpacing: '-0.025em' }}>
                  <span style={{ fontWeight: 800 }}>{splitValueUnit(valueText).num}</span>
                  {splitValueUnit(valueText).unit && (
                    <span style={{ fontWeight: 500, fontSize: '0.82em' }}> {splitValueUnit(valueText).unit}</span>
                  )}
                </p>
                <Sparkline series={series} color={theme.main} height={30} width={64} />
              </div>
              {deltaText && (
                <>
                  <p
                    className="font-semibold whitespace-nowrap flex items-center gap-1"
                    style={{ color: deltaColor, marginTop: 6, fontSize: 11 }}
                  >
                    {deltaDir && <span aria-hidden="true">{deltaDir === 'up' ? '↑' : '↓'}</span>}
                    {deltaText}
                  </p>
                  {lastMeasuredText && (
                    <p className="text-[9px] text-muted/70 truncate" style={{ marginTop: 2 }}>
                      {lastMeasuredText}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Hover effect เฉพาะเว็บ/เดสก์ท็อป (@media hover:hover กันไม่ให้ค้างบนมือถือที่ไม่มี hover จริง)
          scale 1.00→1.015 + translateY -2px ตามสเปคที่ขอ, ส่วน "shadow/glow เพิ่ม 10%" ใช้ brightness+contrast
          แทนการคำนวณ alpha สีธีมทีละใบ (ง่ายกว่า/เสถียรกว่า แต่ให้ความรู้สึกใกล้เคียงกัน คือการ์ดดู "เด่นขึ้น" เมื่อชี้เมาส์) */}
      <style jsx>{`
        @media (hover: hover) {
          .metric-card:hover {
            transform: translateY(-2px) scale(1.015);
            filter: brightness(1.06) contrast(1.04);
          }
        }
      `}</style>
    </>
  )
}
