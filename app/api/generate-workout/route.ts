import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// AI Coach "Generate Workout" เชิงลึก — ต่างจาก lib/workoutGenerator.ts (rule-based ล้วน, ไม่เรียก AI
// ภายนอก, เป็น baseline ที่ทำงานได้เสมอ) ตัวนี้ให้ Gemini "ปรุงแต่งทับ" คือเลือก/เรียงท่าใหม่จาก
// รายการท่าที่ rule-based คำนวณไว้แล้วเท่านั้น (ห้ามคิดชื่อท่าใหม่) โดยอิงประวัติจริงของผู้ใช้
// เป็น opt-in (ผู้ใช้กดขอเอง) เหมือน ai-coach-insight/route.ts — ถ้าเรียกไม่สำเร็จ ฝั่ง client
// ต้อง fallback กลับไปใช้โปรแกรม rule-based เดิมเสมอ (ดู CoachPage) ฟีเจอร์นี้พังแล้วหน้าไม่พังตาม

const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `คุณคือผู้ช่วยออกแบบโปรแกรมออกกำลังกายของแอป FITLOG พูดภาษาไทย
กติกาสำคัญ (ห้ามฝ่าฝืนเด็ดขาด):
- เลือกท่าได้เฉพาะจาก "รายการท่าที่ให้มา" เท่านั้น ห้ามคิดชื่อท่าใหม่ ห้ามสะกดหรือแปลชื่อท่าต่างจากที่ให้มาแม้แต่ตัวอักษรเดียว
- เลือกให้ได้จำนวนเท่ากับ exerciseCount ที่ระบุเป๊ะ (ห้ามมากหรือน้อยกว่า) และห้ามเลือกท่าซ้ำ
- ถ้ามีตัวเลือกพอ ให้เลี่ยงท่าที่อยู่ใน "ท่าที่เพิ่งเล่นบ่อยล่าสุด" เพื่อความหลากหลาย แต่ถ้าเลี่ยงแล้วจำนวนไม่ครบ ให้ใช้ท่านั้นซ้ำได้
- เรียงลำดับให้ท่า compound (ท่าใหญ่ใช้หลายข้อต่อ เช่น สควอท เดดลิฟท์ เพรส) มาก่อน ท่า isolation (เช่น เอ็กซ์เทนชัน เคิร์ล) มาทีหลัง
- แต่ละท่าใส่ rationale สั้นๆ 1 ประโยค (ไม่เกิน 15 คำ) อธิบายว่าทำไมถึงเลือก/จัดลำดับแบบนี้ อิงจากบริบทที่ให้มา
- ห้ามให้คำแนะนำทางการแพทย์ ถ้าข้อมูลชวนคิดเรื่องบาดเจ็บ ให้เลี่ยงพูดถึงเรื่องนั้น
- ตอบเป็น JSON ตาม schema เท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือต่อท้าย`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    exercises: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          rationale: { type: 'STRING' },
        },
        required: ['name', 'rationale'],
      },
    },
  },
  required: ['exercises'],
}

interface CandidateExercise {
  name: string
  equipment: string
}

interface GenerateWorkoutPayload {
  muscleGroup: string
  exerciseCount: number
  candidates: CandidateExercise[]
  // ชื่อท่าที่ทำบ่อย/เพิ่งทำล่าสุด — ใช้ให้ Gemini พยายามเลี่ยงเพื่อความหลากหลาย (ไม่บังคับ)
  recentExerciseNames: string[]
  // บริบทเสริมจาก AI Coach เดิม (ถ้ามี) — ให้ Gemini ปรับ rationale ให้เข้ากับสถานการณ์จริงมากขึ้น
  overloadHints: { exerciseName: string; action: string }[]
  balanceStatus: string | null
}

interface AiExerciseResult {
  name: string
  rationale: string
}

function buildUserPrompt(p: GenerateWorkoutPayload): string {
  const lines: string[] = []
  lines.push(`กลุ่มกล้ามเนื้อเป้าหมาย: ${p.muscleGroup}`)
  lines.push(`จำนวนท่าที่ต้องการ (exerciseCount): ${p.exerciseCount}`)
  lines.push(
    `รายการท่าที่ให้มา (เลือกได้เฉพาะจากนี้เท่านั้น): ${p.candidates
      .map((c) => `${c.name} [${c.equipment}]`)
      .join(', ')}`
  )
  lines.push(
    p.recentExerciseNames.length > 0
      ? `ท่าที่เพิ่งทำบ่อยล่าสุด (พยายามเลี่ยงถ้ามีตัวเลือกอื่น): ${p.recentExerciseNames.join(', ')}`
      : 'ยังไม่มีประวัติท่าที่ทำบ่อยล่าสุด'
  )
  if (p.overloadHints.length > 0) {
    lines.push(
      `แผน Progressive Overload ที่คำนวณไว้ (ถ้ามีท่าตรงกับรายการท่าที่ให้มา อาจอ้างถึงใน rationale ได้): ${p.overloadHints
        .map((h) => `${h.exerciseName} → ${h.action}`)
        .join('; ')}`
    )
  }
  if (p.balanceStatus && p.balanceStatus !== 'insufficient_data') {
    lines.push(`สมดุล Push/Pull สัปดาห์นี้: ${p.balanceStatus}`)
  }
  return `${lines.join('\n')}\n\nเลือกและเรียงลำดับท่าตามกติกาที่กำหนด ตอบเป็น JSON ล้วนๆ เท่านั้น`
}

export async function POST(req: NextRequest) {
  // ต้องล็อกอินก่อน — กันคนนอกยิงมาใช้โควต้าฟรีของเราหมด (เหมือน route อื่นๆ ที่เรียก Gemini)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ — ดู .env.local.example' },
      { status: 500 }
    )
  }

  let payload: GenerateWorkoutPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  if (!Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    return NextResponse.json({ error: 'ไม่มีรายการท่าให้เลือก' }, { status: 400 })
  }

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(payload) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // เหมือน analyze-cardio-photo-gemini — gemini-3.5-flash คิดก่อนตอบ (thinking) เสมอ และหัก
          // token จาก maxOutputTokens ด้วย ลดระดับการคิดลงเป็น 'low' + เผื่อ token กันโดนตัดครึ่ง
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json({ error: 'ใช้โควต้าฟรีของ Gemini หมดชั่วคราว ลองใหม่อีกสักครู่' }, { status: 429 })
      }
      const errBody = await res.text().catch(() => '')
      console.error('Gemini API error', res.status, errBody)
      throw new Error(`Gemini API responded ${res.status}`)
    }

    const data = await res.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason
      throw new Error(blockReason ? `Blocked: ${blockReason}` : 'ไม่ได้รับข้อความตอบกลับ')
    }

    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      console.error('Gemini response did not contain JSON', text)
      throw new Error('รูปแบบคำตอบจาก Gemini ไม่ถูกต้อง')
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { exercises?: unknown }
    const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : []

    // ตรวจสอบทุกท่าที่ Gemini เลือกกลับมาว่าตรงกับ candidates จริงเป๊ะ (case-insensitive + trim) —
    // ห้ามเชื่อชื่อท่าจาก AI ตรงๆ เด็ดขาด เพราะถ้าสะกดผิด/แต่งชื่อใหม่ ฝั่ง client จะหาท่านั้นใน
    // exercise library ไม่เจอ แล้วท่านั้นจะหายไปเงียบๆ จากโปรแกรม — filter ทิ้งไปดีกว่าปล่อยผ่าน
    const candidateByNormalizedName = new Map(payload.candidates.map((c) => [c.name.trim().toLowerCase(), c.name]))
    const seen = new Set<string>()
    const validated: AiExerciseResult[] = []
    for (const raw of rawExercises) {
      const r = raw as { name?: unknown; rationale?: unknown }
      if (typeof r.name !== 'string') continue
      const key = r.name.trim().toLowerCase()
      const canonicalName = candidateByNormalizedName.get(key)
      if (!canonicalName || seen.has(canonicalName)) continue
      seen.add(canonicalName)
      validated.push({
        name: canonicalName,
        rationale: typeof r.rationale === 'string' && r.rationale.trim() !== '' ? r.rationale.trim() : '',
      })
    }

    if (validated.length === 0) {
      throw new Error('Gemini ไม่ได้เลือกท่าที่ตรงกับรายการที่ให้ไป')
    }

    return NextResponse.json({ exercises: validated })
  } catch (err) {
    console.error('generate-workout error', err)
    return NextResponse.json({ error: 'ให้ AI ปรุงแต่งโปรแกรมไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
