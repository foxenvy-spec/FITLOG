// scripts/match-exercise-images-exercisedb.mjs
//
// รันสคริปต์นี้ "ในเครื่องของคุณ" (ต้องมีอินเทอร์เน็ต — เครื่องมือของ Claude ที่สร้างไฟล์นี้ไม่มีเน็ต
// จึงเดา URL รูปเองไม่ได้ เพราะเสี่ยงได้ลิงก์ผิด/ตาย) สคริปต์จะ:
//   1. ดึงรายชื่อท่าทั้งหมดจาก ExerciseDB V1 API (Free/OSS version) — ฟรี ไม่ต้องสมัคร ไม่ต้องมี API key
//      เอกสาร: https://docs.ascendapi.com/products/edb-v1/overview
//      Endpoint: https://oss.exercisedb.dev/api/v1/exercises
//      รูปที่ได้เป็น "GIF สาธิตท่า" (180p) ไม่ใช่ภาพ 3D ไฮไลต์กล้ามเนื้อแบบแอปพวก Strong/Hevy
//      (ของแบบนั้นเป็นภาพลิขสิทธิ์ของผู้ให้บริการแต่ละเจ้า ไม่มีเวอร์ชันฟรีให้ดึงมาใช้ตรงๆ)
//      แต่ข้อดีคือ GIF ของ ExerciseDB ตรงกับ "ท่า" การออกกำลังกายแต่ละท่าเป๊ะกว่ารูปนิ่งจาก free-exercise-db เดิม
//   2. จับคู่ชื่ออังกฤษของแต่ละท่าใน EXERCISES ด้านล่างกับชื่อใน dataset แบบ normalize + token overlap
//      (ตรรกะเดียวกับ scripts/match-exercise-images.mjs เดิม)
//   3. เขียนไฟล์ 2 อัน:
//      - supabase/migrations/025_exercise_library_images_exercisedb.sql → อัปเดต image_url เป็น GIF (เฉพาะคู่ที่มั่นใจ)
//      - scripts/match-exercise-images-exercisedb.unmatched.json      → รายการที่จับคู่ไม่ได้
//
// วิธีรัน (Node.js 18+):
//   node scripts/match-exercise-images-exercisedb.mjs
//
// หมายเหตุ: API นี้เป็น free tier ของ ascendapi.com/ExerciseDB — ไม่มี SLA และอาจมี rate limit
// ถ้าโหลดครั้งเดียวไม่ครบ (บาง API แบ่งหน้า) สคริปต์จะไล่ดึงทีละหน้าด้วย ?page=&limit= จนกว่าจะไม่มีข้อมูลใหม่เพิ่ม
// ปลอดภัยที่จะรันซ้ำ — เขียนทับไฟล์เดิมทุกครั้ง

const API_BASE = 'https://oss.exercisedb.dev/api/v1/exercises'

import { EXERCISES } from './exercise-list.mjs'

import { normalize, tokenOverlap } from './match-utils.mjs'

// ดึงทั้งชุดโดยไล่หน้า — เผื่อ endpoint แบ่งหน้า (limit เริ่มต้นไม่ทราบแน่ชัดจาก doc สาธารณะ)
// ถ้า response ไม่มี pagination (คืนทั้งชุดในคำขอเดียว) ลูปจะหยุดตั้งแต่รอบแรกเพราะไม่มีข้อมูลใหม่
async function fetchAllExercises() {
  const collected = new Map()
  let page = 1
  const limit = 200
  const MAX_PAGES = 50 // กันลูปไม่รู้จบถ้า API พฤติกรรมไม่ตรงกับที่คาด

  while (page <= MAX_PAGES) {
    const url = `${API_BASE}?limit=${limit}&offset=${(page - 1) * limit}`
    const res = await fetch(url)
    if (!res.ok) {
      if (page === 1) throw new Error(`โหลด ExerciseDB ไม่สำเร็จ: ${res.status}`)
      break // หน้าแรกสำเร็จแล้ว หน้าเกินขอบเขตให้หยุดเงียบๆ
    }
    const body = await res.json()
    const list = Array.isArray(body) ? body : (body.data ?? body.exercises ?? [])
    if (!Array.isArray(list) || list.length === 0) break

    let addedNew = false
    for (const item of list) {
      const id = item.exerciseId ?? item.id
      if (id && !collected.has(id)) {
        collected.set(id, item)
        addedNew = true
      }
    }
    // ถ้า response ไม่รองรับ offset/limit จริง (คืนชุดเดิมซ้ำทุกครั้ง) ให้หยุด
    if (!addedNew) break
    if (list.length < limit) break // หน้าสุดท้ายแล้ว
    page += 1
  }

  return Array.from(collected.values())
}

async function main() {
  console.log('กำลังโหลด ExerciseDB (free/OSS version)...')
  const dataset = await fetchAllExercises()
  if (dataset.length === 0) throw new Error('ไม่ได้รับข้อมูลจาก ExerciseDB เลย ตรวจสอบ endpoint/เน็ตอีกที')
  console.log(`โหลดสำเร็จ ${dataset.length} ท่าจาก ExerciseDB`)

  const matched = []
  const unmatched = []

  for (const ex of EXERCISES) {
    let best = null
    let bestScore = 0
    for (const d of dataset) {
      const dName = d.name ?? ''
      const nameNorm = normalize(dName)
      const queryNorm = normalize(ex.name)
      const score = nameNorm === queryNorm ? 1 : tokenOverlap(ex.name, dName)
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    // >= 0.7 ถือว่ามั่นใจพอ (ตรงเป๊ะ หรือใกล้เคียงมาก เช่น "Bench Press" vs "Barbell Bench Press")
    const gifUrl = best?.gifUrl ?? best?.gif_url ?? null
    if (best && bestScore >= 0.7 && gifUrl) {
      matched.push({ id: ex.id, name: ex.name, matchedName: best.name, score: bestScore, gifUrl })
    } else {
      unmatched.push({ id: ex.id, name: ex.name, closest: best?.name ?? null, score: bestScore })
    }
  }

  // เขียนทับคอลัมน์ image_url เดิมด้วย GIF (ตรงท่ากว่ารูปนิ่งจาก free-exercise-db)
  // ถ้าอยากเก็บรูปนิ่งเดิมไว้ด้วย ให้เพิ่มคอลัมน์ใหม่ (เช่น demo_gif_url) แทนการ UPDATE ทับที่นี่
  const sqlRows = matched
    .map((m) => `  ('${m.id}', '${m.gifUrl.replace(/'/g, "''")}')`)
    .join(',\n')

  const sql = `-- 025_exercise_library_images_exercisedb.sql
-- สร้างอัตโนมัติจาก scripts/match-exercise-images-exercisedb.mjs
-- จับคู่กับ ExerciseDB V1 API (Free/OSS, https://oss.exercisedb.dev) — GIF สาธิตท่าตรงกว่ารูปนิ่งเดิม
-- จับคู่ได้ ${matched.length}/${EXERCISES.length} ท่า (ที่เหลือดู match-exercise-images-exercisedb.unmatched.json)
-- เขียนทับ image_url เดิม (จาก free-exercise-db) ด้วย GIF ตัวใหม่ — รันซ้ำได้ปลอดภัย

update public.exercise_library as e
set image_url = v.url
from (values
${sqlRows}
) as v(id, url)
where e.id = v.id;
`

  const fs = await import('node:fs/promises')
  await fs.writeFile('supabase/migrations/025_exercise_library_images_exercisedb.sql', sql, 'utf-8')
  await fs.writeFile(
    'scripts/match-exercise-images-exercisedb.unmatched.json',
    JSON.stringify(unmatched, null, 2),
    'utf-8'
  )

  console.log(`\nจับคู่สำเร็จ: ${matched.length}/${EXERCISES.length}`)
  console.log(`ไม่พบคู่ที่มั่นใจ: ${unmatched.length} ท่า → ดูรายชื่อใน scripts/match-exercise-images-exercisedb.unmatched.json`)
  console.log('เขียนไฟล์ supabase/migrations/025_exercise_library_images_exercisedb.sql แล้ว')
  console.log('ตรวจ GIF ที่จับคู่ได้เร็วๆ ก่อนรันจริง (บาง match อาจเป็นท่าใกล้เคียงแต่ไม่เป๊ะ 100%)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
