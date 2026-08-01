// Vibration API — รองรับ Android Chrome/Firefox เป็นหลัก ส่วน iOS Safari (เป้าหมายหลักของดีไซน์นี้
// ทั้งหมดคือ iPhone 15/16 Pro) ไม่รองรับ navigator.vibrate เลย (WebKit ไม่เคย implement API นี้) —
// ทุกฟังก์ชันด้านล่าง feature-detect ก่อนเรียกเสมอ จึงเป็น no-op เงียบๆ บน iOS/เดสก์ท็อป แทนที่จะ error
function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator
}

// แตะปกติ (การ์ด, ปุ่มทั่วไป) — สั้นมากแค่ให้รู้สึก "ตอบสนอง" ไม่ใช่ buzz ยาวรบกวน
export function hapticTap(): void {
  if (canVibrate()) navigator.vibrate(10)
}

// แอ็กชันสำคัญ (เริ่มออกกำลังกาย, ทำเซตเสร็จ) — จังหวะสั้น-เว้น-สั้น ให้ความรู้สึก "สำเร็จ" ชัดกว่า
// hapticTap เฉยๆ
export function hapticSuccess(): void {
  if (canVibrate()) navigator.vibrate([10, 30, 10])
}
