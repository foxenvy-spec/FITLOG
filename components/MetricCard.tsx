'use client'

import { dashboardSpec } from '@/lib/dashboardSpec'
import { NOISE_BG, TEXT, CARD_GRADIENT_CSS, CARD_REFLECTION_CSS, CARD_FLOAT_SHADOW, glowAlphaHex } from '@/lib/theme'
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
  // ความเข้ม glow มุมการ์ด (0-100) — ไม่ใส่ = ใช้ดีฟอลต์ 20 (พฤติกรรมเดิมก่อนมีฟิลด์นี้) เฉพาะมือถือ
  // (compact) เท่านั้นที่อ่านค่านี้จริง — เดสก์ท็อปยัง hardcode alpha คงที่เหมือนเดิมทุกประการ ไม่กระทบ
  // ให้แต่ละการ์ด glow เข้ม/อ่อนไม่เท่ากัน (เช่น น้ำหนัก 18% เข้มกว่ามวลไขมัน 10%) ดูเป็นธรรมชาติกว่า
  // glow เท่ากันหมดทุกใบแบบเดิม
  glow?: number
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
  // ความเข้ม glow ต่อการ์ด (compact เท่านั้น) — ดีฟอลต์ 20 = พฤติกรรมเดิมก่อนมีฟิลด์ theme.glow
  // (เทียบเท่า alpha hex "33" เดิมที่ hardcode คงที่ทุกใบ)
  const glowAlpha = glowAlphaHex(theme.glow ?? 20)
  return (
    <>
      <div
        className={`metric-card relative overflow-hidden ${radiusClass} flex flex-col justify-between ${compact ? '' : tall ? 'h-[138px] 2xl:h-[142px]' : 'h-[124px] 2xl:h-[128px]'}`}
        style={{
          transition: 'transform 200ms ease, filter 200ms ease, box-shadow 200ms ease', // duration 180-220ms ตามที่ขอ
          // ความสูง/padding มือถือ (compact) มาจาก dashboardSpec.metricCard (160px / 16px) — ค่าคงที่
          // (ไม่ใช่ min-height เหมือนรอบก่อน) ตาม Tailwind class แบบไดนามิกใช้ JIT ไม่ได้ (ตรวจจับตอน build
          // ไม่เจอค่าที่มาจากตัวแปร) จึงกำหนดผ่าน style ตรงๆ แทน — เดสก์ท็อป (compact=false) ไม่กระทบ
          height: compact ? dashboardSpec.metricCard.height : undefined,
          padding: compact ? dashboardSpec.metricCard.padding : '16px 18px 12px',
          border: '1.5px solid transparent',
          // 5 background ซ้อนกัน วาดถึง border-box (เพื่อทำ "ขอบไล่สี"), เรียงจากบนสุด(วาดทับ)ไปล่างสุด:
          // 1) CARD_REFLECTION_CSS แถบสะท้อนแสงตรงจากขอบบน (มือถือ (compact) เท่านั้น — ให้วัสดุการ์ด
          //    สอดคล้องกับ PremiumCard, แทน rim light เฉียง 135deg เดิมซึ่งไม่ใช่ทิศทางแสงแบบโลหะขัดเงา
          //    จริงที่สะท้อนจากด้านบนตรงๆ) 2) ไล่สีเข้มพรีเมียมด้านใน + จุดสว่างจางๆ กลางการ์ด กันไม่ให้
          //    กลางการ์ดดำตันเกินไป วาดถึงแค่ padding-box (คือพื้นการ์ดจริง ทับซ่อนกลางของ 3-5 ไว้) —
          //    มือถือ (compact) ใช้ CARD_GRADIENT_CSS เทาเย็น (โทนเดียวกับ PremiumCard ทั้งแอป) แทนเทากลาง
          //    #242424/#171717/#101010 เดิม (R=G=B เป๊ะ ไม่เย็นจริง) — เดสก์ท็อป (compact=false) ยังคง
          //    โทนกรมท่าเดิมทุกประการ ไม่กระทบ
          // 3) radial glow ที่มุมซ้ายบน (สี main) 4) radial glow ที่มุมขวาล่าง (สี second) — มือถือ
          //    (compact) ใช้ glowAlpha (จาก theme.glow ต่อการ์ด) แทน alpha เต็มค่าคงที่เดิม ให้แต่ละการ์ด
          //    glow เข้ม/อ่อนไม่เท่ากันจริง (เช่น น้ำหนัก 18% เข้มกว่ามวลไขมัน 10%) — เดสก์ท็อปยังใช้สีเต็ม
          //    ไม่มี alpha เหมือนเดิมทุกประการ ไม่กระทบ
          // 5) เข้ม→อ่อน→เข้ม แนวทแยง (แทนสีพื้นจางๆ เรียบๆ เดิม) กันไม่ให้ช่วงกลางขอบ/มุมอื่นดูเป็นเส้นแข็งทื่อ
          // ผลคือขอบเรืองแสงชัดเฉพาะ 2 มุมตรงข้ามกัน ส่วนช่วงกลางขอบก็ยังไล่เฉดนุ่มๆ ไม่ใช่เส้นตรงแข็งๆ
          backgroundImage: compact
            ? `${CARD_REFLECTION_CSS}, radial-gradient(circle at 50% 55%, #2C2E33, transparent 60%), ${CARD_GRADIENT_CSS}, radial-gradient(120% 120% at 0% 0%, ${theme.main}${glowAlpha}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}${glowAlpha}, transparent 55%), linear-gradient(135deg, ${theme.main}14, ${theme.main}40, ${theme.main}14)`
            : `radial-gradient(circle at 50% 55%, #1B2230, transparent 60%), linear-gradient(180deg, #13233A, #08121F), radial-gradient(120% 120% at 0% 0%, ${theme.main}, transparent 55%), radial-gradient(120% 120% at 100% 100%, ${theme.second}, transparent 55%), linear-gradient(135deg, ${theme.main}14, ${theme.main}40, ${theme.main}14)`,
          backgroundOrigin: 'border-box',
          backgroundClip: compact
            ? 'padding-box, padding-box, padding-box, border-box, border-box, border-box'
            : 'padding-box, padding-box, border-box, border-box, border-box',
          // ชั้นซ้อนกัน: ambient shadow (มือถือ (compact) ใช้ CARD_FLOAT_SHADOW เบาบางกว่าเดิมให้การ์ด
          // ดูลอย เดสก์ท็อปยังใช้ contact+ambient shadow คู่เดิมทุกประการ) + inset highlight (มือถือ
          // (compact) ใช้ inset แนวทแยงมุมบนซ้ายแบบเดียวกับ CARD_INSET_SHADOW ของ PremiumCard ให้ความสว่าง
          // กระจุกที่มุม ไม่ใช่เต็มเส้นขอบบนแบบเดิม — เดสก์ท็อปคงค่าเดิม inset 0 1px ทุกประการ) + inset
          // เงาเข้มขอบล่างแบบจม (compact/มือถือเท่านั้น เดสก์ท็อปไม่กระทบ) + glow สีธีมเยื้อง offset ไปมุม
          // ซ้ายบน/ขวาล่าง (แทนที่จะเป็น 0 0 แผ่เท่ากันทุกด้าน) ให้ธีมสีเรืองแสงเฉพาะ 2 มุมตรงข้ามให้เข้ากับขอบ
          // — มือถือ (compact) ใช้ glowAlpha ต่อการ์ดแทน alpha "33" คงที่เดิม
          boxShadow: `${compact ? CARD_FLOAT_SHADOW : '0 2px 6px rgba(0,0,0,.35), 0 8px 24px 2px rgba(0,0,0,.4)'}, ${compact ? 'inset 1px 1px 0 0 rgba(255,255,255,.09)' : 'inset 0 1px rgba(255,255,255,.05)'}, ${compact ? 'inset 0 -4px 10px rgba(0,0,0,.6), ' : ''}-6px -6px 20px ${theme.main}${compact ? glowAlpha : '33'}, 6px 6px 20px ${theme.second}${compact ? glowAlpha : '33'}`,
        }}
      >
        {/* เกรนผิวโลหะบางๆ (Dark Titanium เดียวกับหน้าเทมเพลต/PremiumCard) — compact/มือถือเท่านั้น
            เดสก์ท็อปไม่กระทบ (ดีไซน์ของตัวเองอยู่แล้ว ไม่ได้ตั้งใจให้เป็น titanium) */}
        {compact && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${radiusClass}`}
            style={{ backgroundImage: NOISE_BG, opacity: 0.03, mixBlendMode: 'overlay' }}
          />
        )}
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
              // TEXT.body (แทน rgba ขาว 94% เดิม) — ตามระดับสีตัวหนังสือใหม่ (Title/Body/Secondary/
              // Caption) กันไม่ให้ label ขาวจ้าเท่าตัวเลขหลัก ซึ่งควรเด่นกว่า
              color: compact ? TEXT.body : 'rgba(255,255,255,.94)',
              // ป้ายชื่อ Metric: มือถือ (compact) จาก dashboardSpec.metricCard.labelFontSize (15px,
              // เดิม 16px) — ลด 1pt กันชื่อยาว ("ไขมันในร่างกาย", "กล้ามเนื้อโครงร่าง") ตัดบรรทัดเพิ่ม
              // ความสูงการ์ดโดยไม่จำเป็น (ดู BodyMetricsRow.tsx ที่ย่อชื่อสองอันนี้ให้สั้นลงด้วยแล้ว)
              // เดสก์ท็อป (compact=false) ยังคง 700/11px เดิมทุกประการ ไม่กระทบ
              fontWeight: compact ? 500 : 700,
              fontSize: compact ? dashboardSpec.metricCard.labelFontSize : 11,
            }}
          >
            <span
              className={`relative shrink-0 inline-flex items-center justify-center rounded-[10px] overflow-hidden ${compact ? 'w-[22px] h-[22px]' : 'w-[42px] h-[42px]'}`}
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
                  width: compact ? 17 : 38,
                  height: compact ? 17 : 38,
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
            // ชิดขวา) ต่อด้วย sparkline เต็มความกว้างเป็นแถวแยกด้านล่าง — ขนาดตัวเลข/กราฟมาจาก
            // dashboardSpec.metricCard (valueFontSize 22px, sparklineHeight 20px) แหล่งความจริงเดียว
            <>
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-mono leading-none"
                  style={{
                    // TEXT.title (แทน text-ink #F3F0E8 เดิม) — ตัวเลขหลักของการ์ด ควรเป็นสีเด่นสุด
                    color: TEXT.title,
                    fontSize: dashboardSpec.metricCard.valueFontSize,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
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
                <div className="mt-1 w-full">
                  <Sparkline series={series} color={theme.main} height={dashboardSpec.metricCard.sparklineHeight} width={200} stretch />
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
