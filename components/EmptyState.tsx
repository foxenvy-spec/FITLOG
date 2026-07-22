// การ์ดแสดงผลตอนยังไม่มีข้อมูล — แทนที่ข้อความเปล่าๆ กลางจอด้วยไอคอน + ข้อความให้กำลังใจ +
// ปุ่ม CTA ชวนให้ลงมือทำต่อทันที ให้ความรู้สึกเป็นมิตรกว่าการโชว์แค่ "ยังไม่มีข้อมูล"
interface EmptyStateProps {
  icon: string
  title: string
  message?: string
  ctaHref?: string
  ctaLabel?: string
}

export default function EmptyState({ icon, title, message, ctaHref, ctaLabel }: EmptyStateProps) {
  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-6 py-10 text-center">
      <span className="text-4xl leading-none" aria-hidden="true">
        {icon}
      </span>
      <p className="font-display text-sm tracked uppercase text-ink mt-4">{title}</p>
      {message && <p className="text-xs text-muted mt-1.5 max-w-[26ch] mx-auto">{message}</p>}
      {ctaHref && ctaLabel && (
        <a
          href={ctaHref}
          className="inline-block mt-5 text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2.5 active:scale-[0.99] transition"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  )
}
