// scripts/match-exercise-images.mjs
//
// รันสคริปต์นี้ "ในเครื่องของคุณ" (ต้องมีอินเทอร์เน็ต — เครื่องมือของ Claude ที่สร้างไฟล์นี้ไม่มีเน็ต
// จึงเดา URL รูปเองไม่ได้ เพราะเสี่ยงได้ลิงก์ผิด/ตาย) สคริปต์จะ:
//   1. ดึง exercises.json จาก free-exercise-db (Public Domain, ใช้เชิงพาณิชย์ได้ฟรี
//      https://github.com/yuhonas/free-exercise-db)
//   2. จับคู่ชื่ออังกฤษของแต่ละท่าใน EXERCISES ด้านล่างกับชื่อใน dataset แบบ normalize + token overlap
//      (ตรรกะเดียวกับ lib/exercises.ts matchExercise เวอร์ชันย่อ)
//   3. เขียนไฟล์ 2 อัน:
//      - supabase/migrations/015_exercise_library_images.sql   → เฉพาะคู่ที่มั่นใจ (มี match ตรงหรือใกล้เคียงมาก)
//      - scripts/match-exercise-images.unmatched.json          → รายการที่จับคู่ไม่ได้ ให้ไปหารูปเอง/ปรับชื่อ
//
// วิธีรัน (Node.js 18+):
//   node scripts/match-exercise-images.mjs
//
// รูปจาก free-exercise-db เป็นไฟล์ .jpg โฮสต์อยู่บน GitHub raw (ฟรี ไม่ต้องมี CDN ของตัวเอง)
// ใช้ path แรก (มุมเริ่มท่า) ของแต่ละท่าเป็นค่า image_url

const DATASET_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises/'

// รายชื่อท่าทั้งหมดที่มีอยู่ตอนนี้ใน exercise_library (id ต้องตรงกับใน DB เป๊ะ)
// เพิ่มชุดถัดไป (หลัง/ขา/ไหล่/แขน/core ฯลฯ) เข้ามาต่อท้าย array นี้ได้เรื่อยๆ แล้วรันสคริปต์ใหม่
import { EXERCISES } from './exercise-list.mjs'

import { normalize, tokenOverlap } from './match-utils.mjs'

async function main() {
  console.log('กำลังโหลด free-exercise-db...')
  const res = await fetch(DATASET_URL)
  if (!res.ok) throw new Error(`โหลด dataset ไม่สำเร็จ: ${res.status}`)
  const dataset = await res.json()
  console.log(`โหลดสำเร็จ ${dataset.length} ท่าจาก free-exercise-db`)

  const matched = []
  const unmatched = []

  for (const ex of EXERCISES) {
    let best = null
    let bestScore = 0
    for (const d of dataset) {
      const nameNorm = normalize(d.name)
      const queryNorm = normalize(ex.name)
      const score = nameNorm === queryNorm ? 1 : tokenOverlap(ex.name, d.name)
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    // >= 0.7 ถือว่ามั่นใจพอ (ตรงเป๊ะ หรือใกล้เคียงมาก เช่น "Bench Press" vs "Barbell Bench Press")
    if (best && bestScore >= 0.7 && best.images?.[0]) {
      matched.push({ id: ex.id, name: ex.name, matchedName: best.name, score: bestScore, image: best.images[0] })
    } else {
      unmatched.push({ id: ex.id, name: ex.name, closest: best?.name ?? null, score: bestScore })
    }
  }

  const sqlRows = matched
    .map((m) => `  ('${m.id}', '${IMAGE_BASE}${m.image}')`)
    .join(',\n')

  const sql = `-- 015_exercise_library_images.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images.mjs — จับคู่ชื่อกับ free-exercise-db (Public Domain)
-- จับคู่ได้ ${matched.length}/${EXERCISES.length} ท่า (ที่เหลือดู match-exercise-images.unmatched.json)
-- รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
${sqlRows}
) as v(id, url)
where e.id = v.id;
`

  const fs = await import('node:fs/promises')
  await fs.writeFile('supabase/migrations/015_exercise_library_images.sql', sql, 'utf-8')
  await fs.writeFile(
    'scripts/match-exercise-images.unmatched.json',
    JSON.stringify(unmatched, null, 2),
    'utf-8'
  )

  console.log(`\nจับคู่สำเร็จ: ${matched.length}/${EXERCISES.length}`)
  console.log(`ไม่พบคู่ที่มั่นใจ: ${unmatched.length} ท่า → ดูรายชื่อใน scripts/match-exercise-images.unmatched.json`)
  console.log('เขียนไฟล์ supabase/migrations/015_exercise_library_images.sql แล้ว')
  console.log('ตรวจรูปที่จับคู่ได้เร็วๆ ก่อนรันจริง (บาง match อาจเป็นท่าใกล้เคียงแต่ไม่เป๊ะ 100%)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
