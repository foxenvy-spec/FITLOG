'use client'

import Link from 'next/link'
import type { FitnessScoreResult } from '@/lib/fitnessScore'
import { useCountUp } from '@/lib/useCountUp'
import FitnessRing from './FitnessRing'

interface FitnessScoreProps {
  score: FitnessScoreResult
  /** เส้นผ่านศูนย์กลางวงแหวน (px) — สเปก mockup ล่าสุดขอ 110–120px, ดีฟอลต์ 110 */
  size?: number
}

// วงแหวน Fitness Score — คะแนนรวมใหม่ (ไม่มีอยู่ใน FITLOG เดิม) ดูสูตรคำนวณเต็มที่ lib/fitnessScore.ts
// ลิงก์ไปหน้า /stats เพราะยังไม่มีหน้ารายละเอียดคะแนนนี้โดยเฉพาะ — /stats คือที่ที่ใกล้เคียงที่สุด
//
// v10: ตัว "วง" เปลี่ยนจาก ProgressRing (SVG stroke-dasharray) มาเป็น FitnessRing (conic-gradient +
// CSS mask) ตามสเปคเอฟเฟกต์ header ชุดใหม่ — ไฟล์นี้เหลือแค่ "ประกอบร่าง" เฉพาะหน้า dashboard
// (ลิงก์ /stats, label Fitness Score/tier,
// ตัวเลขนับขึ้นด้วย useCountUp ที่มีอยู่แล้วในโปรเจกต์ — ใช้ตัวเดียวกับ GoalRing.tsx ไม่ได้สร้างซ้ำ)
// เวลาคะแนนเปลี่ยน (เช่น 89 -> 90) ทั้งตัวเลขกลางวงและเส้น progress จะไล่ขึ้นพร้อมกันนุ่มๆ
// เพราะใช้ animatedScore ตัวเดียวกันทั้งสองจุด ไม่ใช่กระโดดทันที
//
// สีวง + tier label เปลี่ยนตาม tier ของคะแนนแล้ว (score.gradientStops / score.color จาก
// lib/fitnessScore.ts) แทนที่จะเป็นสีไฟคงที่ (FIRE_ACCENT) เดิม — เพิ่มบรรทัดคำแนะนำ (score.
// recommendation) ต่อท้าย tier label ให้ผู้ใช้เข้าใจ "ควรทำอะไรต่อ" ไม่ใช่แค่เห็นตัวเลข/ชื่อ tier เฉยๆ
export default function FitnessScore({ score, size = 110 }: FitnessScoreProps) {
  const animatedScore = Math.round(useCountUp(score.score, 900))

  return (
    <Link
      href="/stats"
      className="flex flex-col items-center gap-1.5"
      aria-label={`Fitness Score ${score.score} จาก 100 — ${score.tierLabelTh} — ${score.recommendation}`}
    >
      {/* v11: ฟีดแบ็ก "ทำให้ Fitness Score เข้าใจได้ใน 1 วินาที — ผู้ใช้ใหม่อาจถามว่า 48 ของอะไร"
          — ป้าย "Fitness Score" ถูกตัดออกไปตั้งแต่รอบลดความสูง Header ก่อนหน้านี้มาก (เหตุผลตอนนั้นคือ
          บริบทรอบตัวเลขชัดพอแล้ว) — กลับมาใส่อีกครั้งตามที่ขอ แต่คุมให้เล็ก/แน่นที่สุด (8px, margin
          บางๆ) ไม่ให้กลับไปดันความสูง Header เหมือนเดิม */}
      <p className="text-[8px] tracked uppercase leading-none" style={{ color: '#8A8E96', marginBottom: 3 }}>
        Fitness Score
      </p>
      {/* animate-pop-in (scale 0.6→1.1→1, keyframe ที่มีอยู่แล้วใน globals.css ใช้กับ badge/pill อื่นๆ
          ในแอป) — เดิมวงมาปุ๊บนิ่งเลยตอนโหลดหน้า ไม่มี entrance animation ของตัวเองต่างจากตัวเลข/เส้น
          progress ที่นับขึ้น/ไล่ยาวอยู่แล้ว เพิ่มให้วงทั้งก้อน "ป๊อป" เข้ามาตอน mount ครั้งแรก */}
      <div className="relative flex items-center justify-center animate-pop-in">
        {/* Bloom หลังวง — เดิมไม่มีเลย (ตัด Glow wrapper ออกตอนลดความสูง header รอบก่อน) ทำให้วงลอย
            อยู่บนพื้นเปล่าๆ ไม่มี "แสงส่องจากด้านหลัง" แบบภาพอ้างอิง — ใช้สี tier ปัจจุบัน (score.color)
            ไม่ตายตัวเป็นส้มเสมอ ให้ยังสัมพันธ์กับสีวง/ข้อความเหมือนจุดอื่นในหน้า
            v18: ฟีดแบ็ก "Orange Glow ยังเป็น Layer เดียว อยากให้รู้สึกว่ามันเรืองจริง" — แยกจาก 1 ชั้นเป็น
            5 ชั้นตามลำดับที่ขอ (Core/Bloom/Fog อยู่หลังวง, Particle/Specular อยู่หน้าวงแต่นอกรัศมีตัวเลข
            กลาง ไม่บังเนื้อหา) ทั้งหมด static ตามที่ยืนยัน ไม่มี animation/gyroscope */}
        {/* v20: ฟีดแบ็ก "Glow + Ring + Orange + Background รวมกันเด่นไปหน่อย ลดลงเล็กน้อย" — 3 ชั้น Fog/
            Bloom/Core ด้านล่างลดอัลฟาลง ~15% ทั้งชุด (14/26/40 -> 11/20/36 hex) ยังคงลำดับความเข้มเดิม
            (Fog จางสุด -> Core เข้มสุด) แค่ลดความเข้มรวมลง ไม่ตัดชั้นไหนออก */}
        {/* Fog — วงนอกสุด กว้างที่สุด จางที่สุด จำลองหมอกแสงฟุ้งไกลรอบนอก */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 2.6,
            height: size * 2.6,
            background: `radial-gradient(circle, ${score.color}11, transparent 60%)`,
          }}
          aria-hidden="true"
        />
        {/* Bloom — ชั้นเดิม ปรับอัลฟาลงเล็กน้อยเพราะตอนนี้มี Fog ห่อรอบนอกอีกชั้นแล้ว
            v30: ฟีดแบ็ก "ring-bloom-breathe ❌ Bloom ควรนิ่ง" — ตัด animation หายใจ (v22) ออก กลับไปนิ่ง
            เหมือน Fog/Core ชั้นอื่นๆ รอบๆ วง */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            background: `radial-gradient(circle, ${score.color}20, transparent 65%)`,
          }}
          aria-hidden="true"
        />
        {/* Core — วงในสุด แคบ เข้มกว่าจุดอื่น จำลองแกนแสงตรงกลางที่ตัววงลอยอยู่เหนือ */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.05,
            height: size * 1.05,
            background: `radial-gradient(circle, ${score.color}36, transparent 55%)`,
          }}
          aria-hidden="true"
        />
        <FitnessRing value={animatedScore} size={size} gradientStops={score.gradientStops}>
          <span className="font-mono text-ink leading-none" style={{ fontSize: Math.round(size * 0.28) }}>
            {animatedScore}
          </span>
          <span className="text-muted leading-none mt-0.5" style={{ fontSize: Math.round(size * 0.12) }}>
            /100
          </span>
        </FitnessRing>
        {/* Tiny Particle — จุดแสงเล็กๆ กระจายรอบวง (คงที่ ไม่ animate) จำลองประกายฝุ่นแสงที่ลอยอยู่ในหมอก */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              `radial-gradient(circle 2px at 14% 20%, ${score.color}99, transparent 100%)`,
              `radial-gradient(circle 1.5px at 88% 26%, ${score.color}80, transparent 100%)`,
              `radial-gradient(circle 1.5px at 80% 88%, ${score.color}70, transparent 100%)`,
              `radial-gradient(circle 1px at 20% 84%, ${score.color}60, transparent 100%)`,
            ].join(', '),
          }}
          aria-hidden="true"
        />
        {/* Specular Highlight — จุดสว่างจ้าเล็กๆ จุดเดียว มุมบนขวาของวง จำลองแสงกระทบผิวมันวาว
            (offset ด้วย top/right ไม่ใช่กึ่งกลาง กันไม่ให้ทับตัวเลขกลางวง) */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 8,
            height: 8,
            top: size * 0.08,
            right: size * 0.12,
            background: 'radial-gradient(circle, rgba(255,255,255,.85), transparent 70%)',
          }}
          aria-hidden="true"
        />
        {/* v31: ฟีดแบ็ก "เหลือแค่ 7 Animation ทั้งแอป — Ring: rotate 12s + spark ตอน sweep ผ่าน" — เดิมมี
            sweep+spark ของตัวเองอยู่ตรงนี้ (ring-sweep-wrap/ring-tiny-spark) ซ้อนทับกับ light sweep ที่
            FitnessRing.tsx (ซึ่งวงนี้ห่ออยู่) มีอยู่แล้วในตัว (.animate-ring-sweep-slow) — กลายเป็นวงเดียว
            มีจุดสว่างหมุนอยู่ 2 จุดพร้อมกันโดยไม่จำเป็น ตัดชุดนี้ทิ้งทั้งหมด รวม "spark ตอน sweep ผ่าน" เข้า
            ไปเป็นการกะพริบของจุดสว่างใน FitnessRing.tsx เองแทน (ดูคอมเมนต์ v31 ที่ไฟล์นั้น) — เหลือ animation
            เดียวของวงทั้งก้อนจริงๆ ไม่ใช่ 2 ชั้นซ้อนกัน */}
      </div>
      {/* ตัดบรรทัด "Fitness Score" micro-label ออก (เดิมอยู่เหนือ tier label) — ความหมายของวงชัดเจน
          อยู่แล้วจากบริบท (ตัวเลข 0-100 + /100 กลางวง) ไม่ต้องมีป้ายชื่อซ้ำ ประหยัดพื้นที่แนวตั้งได้อีก
          ชั้นหนึ่ง — บรรทัด recommendation ยังคงบังคับบรรทัดเดียว (nowrap+ellipsis) เพราะข้อความยาว
          (เช่น "Your body needs recovery") ดันให้คอลัมน์วงสูงกว่าคอลัมน์ซ้ายมาก */}
      <div className="text-center">
        <p
          className="font-display font-bold tracked uppercase leading-tight"
          style={{ fontSize: 14, color: score.color }}
        >
          {score.tierLabel}
        </p>
        {/* v9: ฟีดแบ็ก "Typography บางจุดยังบางและเล็ก โดยเฉพาะ Light Training Recommendation — เพิ่ม
            contrast ก่อน ไม่ต้องขยายขนาดเยอะ" — บรรทัดคำแนะนำนี้ยังเป็น text-muted (#9498A0) เดิม ไม่เคย
            ถูกแตะเลยตลอดหลายรอบก่อน (แม้ตัวเลข/tier label ข้างบนถูกปรับไปหลายรอบแล้ว) ขยับเป็น #CFD4DE
            ตามระดับเดียวกับ caption อื่นที่ปรับไปแล้วในรอบนี้ ไม่แตะขนาด (9px คงเดิม)
            v10: ฟีดแบ็ก "แก้ Light Training Recommen... — อย่าให้ข้อความสำคัญโดนตัด" — nowrap+ellipsis
            เดิมตัดข้อความยาว (เช่น "Light Training Recommended", "Your body needs recovery") จนอ่านไม่รู้
            เรื่อง ตัดทั้งคู่ออก ปล่อยให้ตกบรรทัดได้ 2 บรรทัดแทนภายใน maxWidth เดิม (120px) — คอลัมน์วงจะสูง
            ขึ้นบ้างเมื่อข้อความยาวตกบรรทัด แต่สำคัญกว่าการตัดข้อความทิ้งครึ่งหนึ่ง
            v11: ฟีดแบ็ก "ชอบ Light Training มากกว่า Light Training Recommended — เข้ากับ English UI ของ
            Score" — สลับมาใช้ score.aiCoachStatus (คำสั้น 2 คำ: Heavy/Normal/Moderate/Light Training,
            Recovery Workout, Rest & Sleep — คนละฟิลด์กับ score.recommendation ที่เป็นประโยคเต็ม ออกแบบไว้
            ให้สั้นสำหรับจุดนี้อยู่แล้วตั้งแต่ lib/fitnessScore.ts แต่ไม่เคยถูกใช้จริงที่ไหนมาก่อน) — สั้นพอ
            ที่จะไม่ต้องตกบรรทัดแล้วในทางปฏิบัติ แต่ยังไม่ลบความสามารถตกบรรทัดออก เผื่อจอแคบผิดปกติ —
            aria-label ด้านบนยังใช้ score.recommendation (ประโยคเต็ม) เพื่อ accessibility เหมือนเดิม */}
        <p
          className="leading-tight mt-0.5"
          style={{ fontSize: 9, color: '#CFD4DE', maxWidth: 120 }}
        >
          {score.aiCoachStatus}
        </p>
      </div>
    </Link>
  )
}
