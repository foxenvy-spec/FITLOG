'use client'

// First-run banner สำหรับผู้ใช้ใหม่ที่ยังไม่มีทั้งประวัติการฝึกและโปรแกรม — เดิม dashboard เสนอ 3
// ทางเท่ากันหมด (บันทึกอิสระ / เลือกโปรแกรม / ถาม AI) ทำให้คนใหม่ไม่รู้ว่าต้องเริ่มจากไหน ตัว banner
// นี้ตัดสินใจแทน: เสนอแค่ 2 ทางที่เป็น "จุดเริ่มต้น" จริงๆ (บันทึกอิสระ เป็นตัวเลือกหลักเพราะ friction
// น้อยสุด, ตั้งโปรแกรมเป็นตัวเลือกรองสำหรับคนที่รู้ตารางฝึกอยู่แล้ว) ส่วน AI Coach ไม่ใส่มาตั้งแต่แรก
// เพราะมันเป็น "ผลลัพธ์หลังมีข้อมูล" ไม่ใช่จุดเริ่มต้น — โผล่ให้เจอเองทีหลังตอนมีข้อมูลพอให้แนะนำจริง
export default function OnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="lg:col-span-2 rounded-lg bg-surface border border-amber/25 shadow-elevated overflow-hidden animate-hero-enter">
      <div className="px-5 py-5 relative">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="ปิด"
          className="absolute top-3 right-3 text-muted hover:text-ink transition p-1 text-sm"
        >
          ✕
        </button>

        <p className="text-[10px] tracked uppercase text-amber flex items-center gap-1.5">
          <span aria-hidden="true">👋</span> ยินดีต้อนรับสู่ FITLOG
        </p>
        <p className="font-display text-lg tracked uppercase text-ink mt-1.5">เริ่มยังไงดี?</p>
        <p className="text-[11px] text-muted mt-1 leading-relaxed">
          ไม่ต้องตั้งค่าอะไรก่อนก็บันทึกได้เลย — โปรแกรมมีไว้ช่วยจำท่าที่ทำซ้ำๆ เฉยๆ ตั้งทีหลังได้เสมอ
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <a
            href="/log"
            className="flex-1 text-center rounded-lg bg-amber text-bg font-display tracked uppercase text-sm py-3 active:scale-[0.99] transition"
          >
            ▶ เริ่มบันทึกเลย
          </a>
          <a
            href="/templates"
            className="flex-1 text-center rounded-lg border border-line text-ink font-display tracked uppercase text-sm py-3 active:scale-[0.99] transition hover:border-steel/60"
          >
            📋 ตั้งโปรแกรมก่อน
          </a>
        </div>
      </div>
    </div>
  )
}
