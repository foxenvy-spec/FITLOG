// template.tsx (ต่างจาก layout.tsx) — Next.js สร้าง instance ใหม่ทุกครั้งที่เปลี่ยนเส้นทาง (แม้ path
// จะ match component เดิมก็ตาม) จึงเป็นจุดที่เหมาะกับ "page transition": เดิมสลับหน้า (เช่น
// dashboard -> session) เนื้อหาเปลี่ยนทันทีห้วนๆ ไม่มี transition ใดๆ เลย ใช้ animation ตัวเดียวกับที่
// การ์ดในหน้า dashboard ใช้อยู่แล้ว (animate-rise, fade+เลื่อนขึ้นเบาๆ) ให้ความรู้สึกต่อเนื่องกันทั้งแอป
// แทนที่จะมี motion language คนละแบบระหว่าง "การ์ดใน dashboard" กับ "การเปลี่ยนหน้า" — ไม่ต้องใช้ hook/
// state ใดๆ เพราะแค่ห่อ children ด้วย className เฉยๆ (การ remount เองคือสิ่งที่ trigger animation ใหม่
// ทุกครั้งอยู่แล้ว) จึงไม่ต้องเป็น client component
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>
}
