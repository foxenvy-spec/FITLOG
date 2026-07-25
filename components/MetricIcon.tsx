// ไอคอนเส้น (stroke) ชุดเดียวกับที่ BodyMetricsRow ใช้ในการ์ดสรุปสัดส่วนร่างกายด้านบนสุดของหน้า —
// แยกออกมาเป็นไฟล์ของตัวเองเพื่อให้ที่อื่น (เช่น InsightCard ของ AI Coach) เรียกใช้ไอคอนชุดเดียวกัน
// ได้โดยไม่ต้อง import จาก component อื่น ให้ทั้งแอปใช้ภาษาภาพเดียวกันแทน emoji
export type MetricIconName = 'weight' | 'bodyFat' | 'muscle' | 'fatMass' | 'bmi'

export default function MetricIcon({ name, color }: { name: MetricIconName; color: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'weight':
      return (
        <svg {...common}>
          <path d="M12 3v3M9 6h6l2.5 15h-11L9 6Z" />
        </svg>
      )
    case 'bodyFat':
      return (
        <svg {...common}>
          <path d="M12 3s5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.4-4 2.5-5.3" />
        </svg>
      )
    case 'muscle':
      return (
        <svg {...common}>
          <path d="M6 20V13a4 4 0 0 1 4-4h1a3 3 0 0 0 3-3v-.5" />
          <path d="M14 5.5c1.8 0 3.5 1 3.5 3.5 0 2-1.2 2.5-1.2 4.5 0 3-2.3 6.5-6.3 6.5" />
        </svg>
      )
    case 'fatMass':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="7" />
          <path d="M9.5 10.5c-.8.6-1.2 1.4-1.2 2.3" />
        </svg>
      )
    case 'bmi':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h1M9 12h1M9 16h1" />
        </svg>
      )
    default:
      return null
  }
}
