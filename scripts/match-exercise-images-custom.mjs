// scripts/match-exercise-images-custom.mjs
//
// จับคู่ "ชุดรูปของคุณเอง" (ไฟล์ที่วางไว้ใน public/images/exercises/ เช่นที่สร้างจาก AI) เข้ากับท่า
// ในตาราง exercise_library แบบเดียวกับ match-exercise-images.mjs เดิม แต่อ่านชื่อไฟล์จากในเครื่อง
// แทนที่จะดึงจาก free-exercise-db ภายนอก — ไม่ต้องต่อเน็ต รันได้ทันที
//
// ชื่อไฟล์ควรใกล้เคียงชื่อท่า (ภาษาอังกฤษ) เช่น "Incline Bench Press.png" — เว้นวรรค/ตัวพิมพ์ใหญ่เล็ก/
// เว้นขีดกลางไม่ต้องตรงเป๊ะ สคริปต์ normalize ให้เอง
//
// วิธีรัน (Node.js 18+):
//   node scripts/match-exercise-images-custom.mjs
//
// เขียนไฟล์ 2 อัน:
//   - supabase/migrations/040_exercise_library_images_custom.sql → เฉพาะคู่ที่มั่นใจ (>= 0.7)
//   - scripts/match-exercise-images-custom.unmatched.json        → ไฟล์ที่จับคู่ไม่ได้ ให้ปรับชื่อไฟล์แล้วรันใหม่
// รันซ้ำได้ปลอดภัย — เขียนทับ migration เดิมทุกครั้ง (ปรับเลข migration เองถ้าเคย commit เลขนี้ไปแล้ว)

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { EXERCISES } from './exercise-list.mjs'
import { normalize, tokenOverlap } from './match-utils.mjs'

const IMAGES_DIR = 'public/images/exercises'
const MIGRATION_PATH = 'supabase/migrations/040_exercise_library_images_custom.sql'
const UNMATCHED_PATH = 'scripts/match-exercise-images-custom.unmatched.json'

async function main() {
  const files = (await readdir(IMAGES_DIR)).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
  console.log(`เจอไฟล์รูป ${files.length} ไฟล์ใน ${IMAGES_DIR}/`)

  // เดิม: จับคู่แบบ "ท่าละไฟล์ที่ดีที่สุด" อิสระต่อกัน ทำให้ท่าที่ชื่อคล้ายกัน (เช่น
  // "Machine Shoulder Press" กับ "Smith Machine Shoulder Press") แย่งไฟล์เดียวกันได้ทั้งคู่ —
  // ท่าหลังได้รูปที่ไม่ตรงอุปกรณ์จริงไปแบบเงียบๆ แถมไฟล์ที่ควรจะไปคู่กับท่าอื่นก็ค้างไม่ถูกใช้
  // แก้ด้วยการจับคู่คะแนนสูงสุดก่อนแบบ one-to-one (ไฟล์ 1 ไฟล์ผูกกับท่าได้แค่ท่าเดียว) —
  // เรียงคู่ทั้งหมดจากคะแนนสูงไปต่ำ ไล่จองทีละคู่ ใครมาก่อนได้ก่อน
  const candidates = []
  for (const ex of EXERCISES) {
    for (const file of files) {
      const fileName = path.parse(file).name
      const score = normalize(fileName) === normalize(ex.name) ? 1 : tokenOverlap(ex.name, fileName)
      if (score >= 0.7) candidates.push({ ex, file, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const matchedByExerciseId = new Map()
  const claimedFiles = new Set()
  for (const c of candidates) {
    if (matchedByExerciseId.has(c.ex.id) || claimedFiles.has(c.file)) continue
    matchedByExerciseId.set(c.ex.id, { id: c.ex.id, name: c.ex.name, file: c.file, score: c.score })
    claimedFiles.add(c.file)
  }

  const matched = []
  const unmatched = []
  for (const ex of EXERCISES) {
    const m = matchedByExerciseId.get(ex.id)
    if (m) {
      matched.push(m)
    } else {
      // เผื่อดีบัก: โชว์ไฟล์ที่ใกล้เคียงที่สุดแม้จะถูกท่าอื่นจองไปแล้วก็ตาม
      let best = null
      let bestScore = 0
      for (const file of files) {
        const fileName = path.parse(file).name
        const score = normalize(fileName) === normalize(ex.name) ? 1 : tokenOverlap(ex.name, fileName)
        if (score > bestScore) {
          bestScore = score
          best = file
        }
      }
      unmatched.push({ id: ex.id, name: ex.name, closest: best, score: bestScore, closestTaken: best ? claimedFiles.has(best) : false })
    }
  }

  // เตือนไฟล์ที่ไม่ถูกใช้เลย (อาจสะกดชื่อท่าไม่ตรงกับ EXERCISES) — ช่วยดีบักตอนจับคู่ไม่ครบ
  const usedFiles = new Set(matched.map((m) => m.file))
  const unusedFiles = files.filter((f) => !usedFiles.has(f))

  const sqlRows = matched
    .map((m) => `  ('${m.id}', '/images/exercises/${encodeURIComponent(m.file)}')`)
    .join(',\n')

  const sql = `-- 040_exercise_library_images_custom.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images-custom.mjs — จับคู่ชื่อไฟล์ใน public/images/exercises/
-- (ชุดรูปที่ทำเอง) กับท่าในตาราง exercise_library
-- จับคู่ได้ ${matched.length}/${EXERCISES.length} ท่า (ที่เหลือดู ${UNMATCHED_PATH})
-- รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
${sqlRows}
) as v(id, url)
where e.id = v.id;
`

  const fs = await import('node:fs/promises')
  await fs.writeFile(MIGRATION_PATH, sql, 'utf-8')
  await fs.writeFile(UNMATCHED_PATH, JSON.stringify(unmatched, null, 2), 'utf-8')

  console.log(`\nจับคู่สำเร็จ: ${matched.length}/${EXERCISES.length}`)
  console.log(`ไม่พบคู่ที่มั่นใจ: ${unmatched.length} ท่า → ดูรายชื่อใน ${UNMATCHED_PATH}`)
  if (unusedFiles.length > 0) {
    console.log(`\nไฟล์รูปที่ไม่ถูกใช้เลย (${unusedFiles.length} ไฟล์) — เช็คว่าสะกดชื่อท่าตรงกับในระบบไหม:`)
    unusedFiles.forEach((f) => console.log(`  - ${f}`))
  }
  console.log(`\nเขียนไฟล์ ${MIGRATION_PATH} แล้ว`)
  console.log('ตรวจรูปที่จับคู่ได้เร็วๆ ก่อนรันจริง (บาง match อาจเป็นท่าใกล้เคียงแต่ไม่เป๊ะ 100%)')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
