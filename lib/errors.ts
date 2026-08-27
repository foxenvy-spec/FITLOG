// v65: ฟีดแบ็ก (บั๊กจริง จากสกรีนช็อต) "เกิดข้อผิดพลาด: [object Object]" ตอนบันทึกเซ็ตในหน้า session —
// สาเหตุคือ error handling เดิมทั่วแอป (`err instanceof Error ? err.message : String(err)`) ถือว่า error
// ที่ไม่ใช่ instanceof Error ต้องแปลงด้วย String() ตรงๆ แต่ error จาก Supabase (PostgrestError ที่ throw
// ตรงๆ จาก `if (wErr) throw wErr`) เป็น plain object ที่มี .message แต่ไม่ผ่าน instanceof Error เสมอไป —
// String() บน plain object คืน "[object Object]" เพราะ Object.prototype.toString ไม่รู้จักฟิลด์ .message
// เลย ใช้ฟังก์ชันกลางนี้แทนทุกจุดที่มี pattern เดิม ให้ดึง .message ออกมาได้แม้ error ไม่ใช่ instanceof Error
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
