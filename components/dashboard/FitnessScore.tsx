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
        {/* Fog — วงนอกสุด กว้างที่สุด จางที่สุด จำลองหมอกแสงฟุ้งไกลรอบนอก */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 2.6,
            height: size * 2.6,
            background: `radial-gradient(circle, ${score.color}14, transparent 60%)`,
          }}
          aria-hidden="true"
        />
        {/* Bloom — ชั้นเดิม ปรับอัลฟาลงเล็กน้อยเพราะตอนนี้มี Fog ห่อรอบนอกอีกชั้นแล้ว */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            background: `radial-gradient(circle, ${score.color}26, transparent 65%)`,
          }}
          aria-hidden="true"
        />
        {/* Core — วงในสุด แคบ เข้มกว่าจุดอื่น จำลองแกนแสงตรงกลางที่ตัววงลอยอยู่เหนือ */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 1.05,
            height: size * 1.05,
            background: `radial-gradient(circle, ${score.color}40, transparent 55%)`,
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
        {/* v20: ฟีดแบ็ก "Ring สวยแล้ว อยากเพิ่ม Specular Highlight/Light Sweep/Tiny Spark วิ่งทุก 8-10
            วินาที เหมือนนาฬิกาหรู" — Specular Highlight คงที่ด้านบนยังอยู่เหมือนเดิม เพิ่มชุดนี้เป็นแอนิเมชัน
            แยกต่างหาก: จุดสว่างหมุนเป็นส่วนโค้ง (ไม่ใช่วนรอบเต็ม 360 องศาต่อเนื่องแบบ loading spinner)
            แล้วเงียบไปจนครบรอบ 9 วินาทีค่อยเริ่มใหม่ — จำลองแสงที่ "กวาดผ่าน" ผิวโลหะเป็นครั้งคราว แบบ
            เข็มนาฬิกาหรูที่ขอบมันวาวจับแสงเวลาเอียง ไม่ใช่หมุนตลอดเวลา — ใช้ wrapper หมุน (transform-origin
            กึ่งกลางวงพอดีเพราะเป็น absolute inset-0 สี่เหลี่ยมจัตุรัส) ครอบจุดสว่างที่ offset ไปขอบวง แทนการ
            คำนวณตำแหน่ง x/y เป็นเปอร์เซ็นต์เอง — เคารพ prefers-reduced-motion (ปิดแอนิเมชันให้เหลือแค่นิ่ง)
            ตรวจสอบด้วย screenshot จริงพบว่าเดิมกวาดตามเข็มนาฬิกา (0->230deg) ซึ่งพาดผ่านโซนวงสีส้มที่สว่าง
            จัดอยู่แล้ว (progress arc ของคะแนน) จุดขาว 5px เลยจมหายไปในแสงส้ม มองแทบไม่เห็น — เปลี่ยนเป็นกวาด
            "ทวนเข็ม" (0 -> -60deg) จากจุดเริ่ม 12 นาฬิกาแทน ซึ่งสำหรับคะแนนที่ไม่เต็ม 100 จะพาดผ่านโซน
            track สีเทาที่ยังไม่ถึงเป้า (มืดกว่ามาก) แทน ทำให้จุดขาวตัดกับพื้นชัดเจนกว่าเดิมมาก */}
        <div className="ring-sweep-wrap absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="ring-sweep-dot absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              top: -1,
              left: '50%',
              marginLeft: -3,
              background: 'radial-gradient(circle, rgba(255,255,255,.95), transparent 70%)',
              boxShadow: '0 0 8px 2px rgba(255,255,255,.6)',
            }}
          />
        </div>
        {/* Tiny Spark — ประกายเล็กจิ๋วแยกจากจุดกวาดหลัก แฟลชสั้นๆ ที่ 24% ของรอบ (ราวๆ วินาทีที่ 2 ของ 9
            วินาที) ต่อจากจุดกวาดหลักที่จบที่ 20% จำลองแสงกระทบซ้ำที่มุมอื่นของวงหลังแสงหลักกวาดผ่านไปแล้ว
            เล็กน้อย ไม่ใช่จุดเดียวกัน */}
        <div
          className="ring-tiny-spark absolute rounded-full pointer-events-none"
          style={{
            width: 3,
            height: 3,
            top: size * 0.1,
            left: size * 0.16,
            background: 'rgba(255,255,255,.95)',
          }}
          aria-hidden="true"
        />
      </div>
      <style jsx>{`
        .ring-sweep-wrap {
          animation: ring-sweep-rotate 9s linear infinite;
        }
        .ring-sweep-dot {
          animation: ring-sweep-fade 9s linear infinite;
        }
        .ring-tiny-spark {
          opacity: 0;
          animation: ring-spark-flash 9s linear infinite;
        }
        @keyframes ring-sweep-rotate {
          0% {
            transform: rotate(0deg);
          }
          20% {
            transform: rotate(-60deg);
          }
          100% {
            transform: rotate(-60deg);
          }
        }
        @keyframes ring-sweep-fade {
          0%,
          100% {
            opacity: 0;
          }
          2%,
          18% {
            opacity: 1;
          }
          20% {
            opacity: 0;
          }
        }
        @keyframes ring-spark-flash {
          0%,
          22%,
          100% {
            opacity: 0;
            transform: scale(1);
          }
          24% {
            opacity: 0.9;
            transform: scale(1.6);
          }
          27% {
            opacity: 0;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ring-sweep-wrap,
          .ring-sweep-dot,
          .ring-tiny-spark {
            animation: none !important;
          }
          .ring-sweep-dot {
            opacity: 0;
          }
        }
      `}</style>
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
        <p
          className="text-muted leading-tight mt-0.5"
          style={{ fontSize: 9, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {score.recommendation}
        </p>
      </div>
    </Link>
  )
}
