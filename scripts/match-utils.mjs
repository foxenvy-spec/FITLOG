// scripts/match-utils.mjs
// ฟังก์ชันจับคู่ชื่อแบบ normalize + token overlap ที่ใช้ร่วมกันทุกสคริปต์จับคู่รูปท่าออกกำลังกาย
// (ตรรกะเดียวกับ lib/exercises.ts matchExercise เวอร์ชันย่อ)

export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[-_.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenOverlap(a, b) {
  const ta = normalize(a).split(' ').filter(Boolean)
  const tb = normalize(b).split(' ').filter(Boolean)
  if (ta.length === 0 || tb.length === 0) return 0
  const setB = new Set(tb)
  const matched = ta.filter((t) => setB.has(t)).length
  return matched / new Set([...ta, ...tb]).size
}
