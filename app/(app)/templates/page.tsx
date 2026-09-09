'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutTemplate, WorkoutTemplateExercise, ProgramDay } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import { WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/weekdays'
import { parseWorkoutExcel } from '@/lib/importWorkoutExcel'
import { getExerciseLibrary } from '@/lib/exerciseLibrary'
import { getErrorMessage } from '@/lib/errors'
import { startTemplateAsWorkoutLog } from '@/lib/startTemplate'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import Image from 'next/image'
import { COLORS, withAlpha, lighten, NOISE_BG, CARD_BORDER_CSS } from '@/lib/theme'
import PremiumCard from '@/components/ui/PremiumCard'

// Dark Titanium — พื้นการ์ดยังเป็นผิวโลหะเข้มเดียวกันหมด (ไม่ใช่ glow สีจัดๆ แบบก่อนหน้า) แต่เอาสัญญะสี
// ต่อวันกลับมาบางๆ (ขอบซ้าย + glow รอบไอคอนแบบเบาๆ) เพราะฟีดแบ็กบอกว่าไม่มีสีเลยรู้สึกจืดไป — ต่างจาก
// เวอร์ชันก่อนตรงที่สีนี้เป็น "จุดเสริม" ไม่ใช่ตัวเด่นของการ์ดอีกต่อไป สีส้ม (COLORS.amber) ยังเป็นสีแบรนด์
// หลักจุดเดียวที่ปุ่ม Start ตามธีมดำ-ส้มของ FitLog
const ACCENT_PALETTE = [COLORS.amber, COLORS.steel, COLORS.violet, COLORS.moss, COLORS.rust] as const

// รูปประกอบวงกลม — ไฟล์ทั้งหมดอยู่ที่ public/images/templates/ เป็น PNG โปร่งใส (ยกเว้น upper.png
// ที่พื้นหลังเข้มอยู่แล้ว) ขนาดจริง 1024x1024 — เรียงคู่กับ ACCENT_PALETTE ตำแหน่งต่อตำแหน่ง (index เดียวกัน)
const ICON_PALETTE = [
  '/images/templates/lower.png',
  '/images/templates/upper.png',
  '/images/templates/legs.png',
  '/images/templates/back.png',
  '/images/templates/chest.png',
] as const

// ฟีดแบ็ก "อัปโหลด Core-Abs.png ให้แล้ว ช่วยเอาไปใช้กับการ์ด Core/Abs ให้หน่อย" — ICON_PALETTE ข้างบนวนรูป
// ตามตำแหน่ง (index ของเทมเพลตในลิสต์) ล้วนๆ ไม่ได้ผูกกับชื่อเทมเพลตจริง จึงชี้รูปเฉพาะเจาะจงให้เทมเพลตที่
// ระบุชื่อมาไม่ได้ตรงๆ (ลำดับเปลี่ยนได้เสมอเมื่อมีเทมเพลตอื่นเพิ่ม/ลบก่อนหน้า) — จับคู่จากคำในชื่อเทมเพลตก่อน
// เจอคำที่รู้จักแล้วใช้รูปเฉพาะนั้นเลย ไม่เจอค่อย fallback ไปวนตาม ICON_PALETTE เหมือนเดิมทุกประการ
//
// v2: ฟีดแบ็ก "import เทมเพลต 5 วันมาเพิ่ม (V2) กลายเป็นรูปไม่ตรงกล้ามเนื้อกับชื่อวัน (Push ได้รูปขา,
// Legs ได้รูปอก ฯลฯ)" — ของเดิม 5 ใบพอดี "ดูเหมือน" ตรงเพราะบังเอิญ index 0-4 วนเข้ากับวันพอดี ไม่ใช่ตั้งใจ
// จับคู่จริง พอมี 10 ใบ การวนตามตำแหน่งเลื่อนจนเห็นชัดว่าไม่ตรง — เพิ่ม override ตามคำในชื่อ (เช็คก่อน Core/Abs
// เดิม ไม่กระทบ) ให้ตรงกับเนื้อหาจริงเสมอไม่ว่าจะมีกี่เทมเพลตหรือเรียงลำดับยังไง — ไล่ดูรูปจริงทุกไฟล์ก่อนจับคู่
// (ไม่ใช่เดาจากชื่อไฟล์อย่างเดียว): chest.png = อกเน้นด้านหน้า (Push/Chest), back.png = หลังเน้นมองจากด้านหลัง
// (Pull/Back), legs.png = ต้นขาด้านหน้าเน้น quad สีม่วง (Legs/Quad), lower.png = ก้น/แฮมสตริง/น่องมองจาก
// ด้านหลัง (Lower/Hamstring/Glute), upper.png = ร่างกายท่อนบนทั้งหมดหน้า-หลัง (Upper ทั่วไป ไม่เจาะจงมัดเดียว)
// — ไม่ใส่คำว่า "อก" เป็นคีย์เวิร์ดแยก เพราะ "อก" เป็น substring ของ "ออกกำลังกาย" (คำทั่วไปทั้งแอป) จะจับคู่
// ผิดเป็น chest.png ทุกชื่อเทมเพลตที่มีคำนี้ปนอยู่ — ใช้ chest/push (อังกฤษ) ซึ่งเทมเพลตจริงของแอปตั้งชื่อแบบนี้
// อยู่แล้วแทน
const TITLE_ICON_OVERRIDES: { keywords: string[]; icon: string }[] = [
  { keywords: ['core', 'abs', 'แกนกลาง'], icon: '/images/templates/Core-Abs.png' },
  { keywords: ['chest', 'push'], icon: '/images/templates/chest.png' },
  { keywords: ['back', 'pull', 'หลัง'], icon: '/images/templates/back.png' },
  { keywords: ['leg', 'quad', 'ขา'], icon: '/images/templates/legs.png' },
  { keywords: ['lower', 'hamstring', 'glute', 'ก้น', 'ล่าง'], icon: '/images/templates/lower.png' },
  { keywords: ['upper', 'บน'], icon: '/images/templates/upper.png' },
]

function iconForTemplate(title: string, index: number): string {
  const t = title.toLowerCase()
  const override = TITLE_ICON_OVERRIDES.find((o) => o.keywords.some((k) => t.includes(k)))
  return override ? override.icon : ICON_PALETTE[index % ICON_PALETTE.length]
}

// NOISE_BG (เท็กซ์เจอร์ผิวโลหะ) ย้ายไปเป็นตัวแปรกลางที่ lib/theme.ts แล้ว ใช้ร่วมกับหน้า dashboard

// แยกหัวข้อเป็น "คำนำ" (เช่น "DAY 5") กับ "ส่วนที่เหลือ" ถ้าชื่อเทมเพลตมีเครื่องหมาย — คั่นอยู่ (ให้น้ำหนัก
// ตัวอักษรต่างกัน คำนำเบากว่า+สีตามวัน ส่วนที่เหลือหนักกว่า+สีขาว ไล่ลำดับสายตาได้ดีกว่าตัวหนาเท่ากันหมด)
// ถ้าไม่มี — เลย (ชื่อเทมเพลตที่ผู้ใช้ตั้งเองส่วนใหญ่ไม่มีรูปแบบนี้) ก็ fallback ไปแสดงทั้งก้อนแบบเดิม
function splitTitle(title: string): [string, string] | null {
  const idx = title.indexOf('—')
  if (idx <= 0 || idx >= title.length - 1) return null
  return [title.slice(0, idx).trim(), title.slice(idx + 1).trim()]
}

// ฟีดแบ็ก "ควรเรียงวันแรกอยู่บนสุดไหม" — เดิม query เรียง created_at ใหม่สุดก่อนเสมอ (ascending: false)
// ทำให้เทมเพลตที่นำเข้าทีหลัง (เช่น พฤหัสบดี ที่ import วนตามลำดับวันในไฟล์แล้วสร้างทีหลังสุด, หรือ "DAY 5")
// ขึ้นบนสุด สลับกับลำดับที่ผู้ใช้วางแผนสัปดาห์จริง — เช็คว่าชื่อเทมเพลตขึ้นต้นด้วยชื่อวันไทย (จันทร์…อาทิตย์)
// หรือ "DAY N" ไหม ถ้าเจอแบบใดแบบหนึ่งให้ค่าลำดับที่ใช้เรียงได้ ไม่เจอคืน null (เทมเพลตชื่อเองแบบอิสระ ไม่มี
// รูปแบบวัน/เลขวันนำหน้า — ยังคงพฤติกรรมเดิมคือใหม่สุดขึ้นก่อน)
function extractDayOrderKey(title: string): number | null {
  const t = title.trim()
  const dayNumberMatch = t.match(/^day\s*(\d+)/i)
  if (dayNumberMatch) return Number(dayNumberMatch[1])
  // WEEKDAYS[0] = อาทิตย์ … WEEKDAYS[6] = เสาร์ (ตรงกับ Date.getDay()) — แปลงให้จันทร์เป็นวันแรกของสัปดาห์
  // แทน (จันทร์=0 … อาทิตย์=6) ให้ตรงกับที่คนไทยวางแผนตารางฝึกกันจริงๆ
  const weekdayIdx = WEEKDAYS.findIndex((w) => t.startsWith(w))
  if (weekdayIdx !== -1) return (weekdayIdx + 6) % 7
  return null
}

// เรียงเทมเพลตที่จับคู่ได้ (ชื่อวัน/DAY N) ตามลำดับวันจริงไว้ก่อน ส่วนที่จับคู่ไม่ได้คงลำดับเดิมที่ส่งเข้ามา
// (created_at ใหม่สุดก่อน) ไว้ต่อท้าย — Array.sort เสถียร (stable) ตาม spec ES2019+ จึงคืนค่า 0 ระหว่างสอง
// รายการที่ไม่มี key ได้อย่างปลอดภัย ไม่ทำให้ลำดับเดิมของกลุ่มนั้นสลับกันเอง
function sortTemplates(list: WorkoutTemplate[]): WorkoutTemplate[] {
  return [...list].sort((a, b) => {
    const ka = extractDayOrderKey(a.title)
    const kb = extractDayOrderKey(b.title)
    if (ka !== null && kb !== null) return ka - kb
    if (ka !== null) return -1
    if (kb !== null) return 1
    return 0
  })
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function slugify(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-+|-+$/g, '') || 'template'
}

function timestamp() {
  return new Date().toISOString().slice(0, 10)
}

// Excel จำกัดชื่อชีตไว้ 31 ตัวอักษร และห้ามมีอักขระ \ / ? * [ ] : — ตัดตัวที่ห้ามทิ้ง + ตัดความยาว แล้ว
// กันชื่อซ้ำกัน (เทมเพลตชื่อเดียวกันสองอันในลิสต์) ด้วยการต่อเลข (2), (3), ... ต่อท้าย — book_append_sheet
// ของ SheetJS จะ error ถ้าชื่อชีตซ้ำกันเป๊ะ
function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` (${n})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate)
  return candidate
}

// ฟีดแบ็ก "อยาก export ทุกเทมเพลตเป็น excel 1 ไฟล์ แต่แยกตาม sheet เพื่อเอาไปวิเคราะห์และแก้ไขท่า" — เดิม
// "⬇ Export" ต่อการ์ดมีอยู่แล้วแต่ export ทีละเทมเพลตเป็น .json (ดู handleExportTemplate) ไม่ใช่ .xlsx รวม —
// สร้าง 1 sheet ต่อเทมเพลต ด้วย aoa_to_sheet (ไม่ใช้ json_to_sheet เหมือน /export เพราะเทมเพลตที่ยังไม่มี
// ท่าเลยต้องได้ sheet ที่มีอย่างน้อยแถวหัวตาราง ไม่ใช่ sheet ว่างเปล่าไร้หัวตาราง) — หัวคอลัมน์ตั้งชื่อให้
// อ่านง่ายสำหรับวิเคราะห์ก่อน แต่เลือกคำที่ parseWorkoutExcel (lib/importWorkoutExcel.ts) รู้จักอยู่แล้วเมื่อ
// ไม่ขัดกับความอ่านง่าย (ชื่อท่า/เซ็ต/Reps/RIR/พัก/เหตุผล) เพื่อให้แก้ไขแล้วนำเข้ากลับผ่านปุ่ม "⬆ Import"
// ได้บางส่วน — กลุ่มกล้ามเนื้อ/กล้ามเนื้อรอง/น้ำหนักเริ่มต้น เป็นข้อมูลอ่านอย่างเดียว (parser ไม่มีคอลัมน์
// รองรับ 3 อย่างนี้ ยังไงก็ไม่รอดตอนนำเข้ากลับอยู่ดี ไม่ใช่บั๊กจากไฟล์นี้)
//
// v2 (บั๊กจริง เจอจากไฟล์ที่ผู้ใช้ตั้งใจจะ import กลับ — ตรวจสอบด้วยการรัน parseWorkoutExcel จริงก่อนแก้):
// เดิม sheet เริ่มด้วยแถวหัวตาราง ('#','ชื่อท่า',...) เป็นแถวแรกสุดเลย ไม่มีแถวชื่อวันแยกต่างหาก — สำหรับ
// ชีต "ตารางเดียว" (single-block ตามที่ parseWorkoutExcel เรียก คือ 1 ชีต 1 ตาราง แบบไฟล์นี้ทุกใบ) ตัว parser
// (ดู parseDaySheets ใน importWorkoutExcel.ts) มีพฤติกรรมเดิม 2 จุดที่ต้องมีแถวคั่นระหว่างหัวตารางกับ
// ข้อมูลจริงเสมอ (comment เดิม "ชีตตารางเดียวเว้น 1 แถวหลังหัวตารางก่อนเริ่มอ่านข้อมูล (พฤติกรรมเดิม)" — ตั้งใจ
// ไว้แบบนี้อยู่ก่อนแล้ว ไม่ใช่บั๊กของ parser ที่ควรแก้ตรงนั้น เพราะกระทบไฟล์รูปแบบอื่นที่ต้องพึ่งพฤติกรรมนี้อยู่):
// (1) ชื่อวัน (title) = เซลล์แรกที่ไม่ว่างของ "ทั้งชีต" — ถ้าไม่มีแถวชื่อวันแยกไว้ก่อนแถวหัวตาราง จะไปเจอ
// เซลล์ "#" ของหัวตารางเข้าแทน ได้ title="#" ผิดทุกชีต (กระทบ handleImportExcel's title-match replace logic
// ตรงๆ — "#" ไม่มีทางตรงกับชื่อเทมเพลตไหนเลย กลายเป็นสร้างเทมเพลตใหม่ชื่อ "#" ซ้ำกันหลายใบแทนที่จะแทนที่ถูกที่)
// (2) dataStartRow = headerRowIdx + 2 เสมอ (ไม่ใช่ +1) สำหรับตารางเดียว — แถวที่ headerRowIdx+1 จึงถูกข้าม
// เสมอ ถ้าแถวนั้นเป็นท่าออกกำลังกายจริง (อย่างที่เคยเป็น) ท่าแรกสุดของทุกวันจะหายไปเงียบๆ ทุกครั้งที่ import
// — แก้โดยเพิ่มแถวชื่อเทมเพลตเต็ม (ไม่ตัดเหมือนชื่อ sheet tab ที่ยาวเกิน 31 ตัวจะโดนตัด) เป็นแถวแรกสุด แล้ว
// ใส่แถวคำอธิบายสั้นๆ (ไม่ว่างเปล่า — isRowEmpty ของ parser เช็คว่า "ทุกเซลล์ว่าง" ถ้าปล่อยว่างจริงจะโดนตีความ
// เป็นจุดจบตาราง (blockEnd) ทันทีที่แถวถัดจากหัวตาราง ทำให้ไม่เหลือข้อมูลเลยสักแถว) คั่นไว้แทนแถวที่ parser
// ตั้งใจข้ามอยู่แล้ว — ยืนยันแก้ถูกจริงโดยรัน parseWorkoutExcel กับไฟล์รูปแบบใหม่นี้ตรงๆ ก่อนส่ง ได้ชื่อวัน/
// จำนวนท่าตรงกับต้นฉบับครบทุกแถวแล้ว
function buildTemplateSheet(title: string, exercises: WorkoutTemplateExercise[]) {
  const header = [
    '#',
    'ชื่อท่า',
    'กลุ่มกล้ามเนื้อ',
    'กล้ามเนื้อรอง',
    'เซ็ต',
    'Reps เป้าหมาย',
    'RIR เป้าหมาย',
    'พัก',
    'น้ำหนักเริ่มต้น (กก.)',
    'เหตุผล',
  ]
  const rows = exercises.map((ex, i) => [
    i + 1,
    ex.exercise_name,
    ex.muscle_group ?? '',
    (ex.secondary_muscles ?? []).join(', '),
    ex.sets ?? '',
    ex.target_reps ?? '',
    ex.target_rir ?? '',
    ex.rest ?? '',
    ex.default_weight_kg ?? '',
    ex.notes ?? '',
  ])
  return XLSX.utils.aoa_to_sheet([
    [title],
    header,
    ['↓ รายละเอียดท่า (แก้ตัวเลขแล้ว Import ไฟล์นี้กลับเข้าแอปได้ที่ปุ่ม "⬆ Import")'],
    ...rows,
  ])
}

interface TemplateExport {
  version: 1
  type: 'fitlog-template'
  title: string
  exercises: Array<{
    exercise_name: string
    muscle_group: string | null
    secondary_muscles: string[]
    exercise_library_id: string | null
    sets: number | null
    target_reps: string | null
    target_rir: string | null
    rest: string | null
    default_weight_kg: number | null
    notes: string | null
  }>
}

export default function TemplatesPage() {
  const supabase = createClient()

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [exercisesByTemplate, setExercisesByTemplate] = useState<Record<string, WorkoutTemplateExercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const [addingToId, setAddingToId] = useState<string | null>(null)
  const [applyPickerId, setApplyPickerId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [exportingAll, setExportingAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data: tRows, error: tErr } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (tErr) {
      setLoadError(tErr.message)
      setLoading(false)
      return
    }

    const typedTemplates = sortTemplates((tRows as WorkoutTemplate[]) ?? [])
    setTemplates(typedTemplates)

    if (typedTemplates.length > 0) {
      const { data: exRows, error: exErr } = await supabase
        .from('workout_template_exercises')
        .select('*')
        .in(
          'template_id',
          typedTemplates.map((t) => t.id)
        )
        .order('position')

      if (exErr) {
        setLoadError(exErr.message)
        setLoading(false)
        return
      }

      const grouped: Record<string, WorkoutTemplateExercise[]> = {}
      ;(exRows as WorkoutTemplateExercise[]).forEach((ex) => {
        grouped[ex.template_id] = grouped[ex.template_id] ?? []
        grouped[ex.template_id].push(ex)
      })
      setExercisesByTemplate(grouped)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreateTemplate(title: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: err } = await supabase.from('workout_templates').insert({ user_id: user.id, title }).select('*').single()
    if (err) {
      setError(err.message)
      return
    }
    const created = data as WorkoutTemplate
    setTemplates((prev) => sortTemplates([created, ...prev]))
    setCreating(false)
    setExpandedId(created.id)
  }

  async function handleDeleteTemplate(id: string, title: string) {
    // ฟีดแบ็ก (Final Production Audit — CTA behavior) เทมเพลตอาจมีหลายท่าอยู่ข้างใน ลบทีเดียวหายทั้งชุด
    // ย้อนกลับไม่ได้ — ต้องมี confirmation เหมือนจุดอื่นที่แก้ไปแล้ว
    if (!window.confirm(`ลบเทมเพลต "${title}" ใช่หรือไม่? ท่าออกกำลังกายทั้งหมดในเทมเพลตนี้จะหายไปด้วย`)) return
    setError(null)
    const { error: err } = await supabase.from('workout_templates').delete().eq('id', id)
    if (err) {
      setError(`ลบเทมเพลตไม่สำเร็จ: ${err.message}`)
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  function handleExportAllToExcel() {
    if (templates.length === 0) return
    setExportingAll(true)
    setError(null)
    try {
      const wb = XLSX.utils.book_new()
      const usedSheetNames = new Set<string>()
      templates.forEach((t) => {
        const sheetName = sanitizeSheetName(t.title, usedSheetNames)
        const ws = buildTemplateSheet(t.title, exercisesByTemplate[t.id] ?? [])
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      })
      XLSX.writeFile(wb, `fitlog-templates-${timestamp()}.xlsx`)
    } catch (err) {
      setError(`Export ไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setExportingAll(false)
    }
  }

  function handleExportTemplate(t: WorkoutTemplate) {
    const exercises = exercisesByTemplate[t.id] ?? []
    const payload: TemplateExport = {
      version: 1,
      type: 'fitlog-template',
      title: t.title,
      exercises: exercises.map((ex) => ({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        target_reps: ex.target_reps,
        target_rir: ex.target_rir,
        rest: ex.rest,
        default_weight_kg: ex.default_weight_kg,
        notes: ex.notes,
      })),
    }
    downloadBlob(JSON.stringify(payload, null, 2), `fitlog-template-${slugify(t.title)}.json`, 'application/json')
  }

  // ฟีดแบ็ก "ยังพัง Unexpected token 'P' ... is not valid JSON" หลัง deploy fix แรกไปแล้ว — เดิมตัดสินใจ
  // .xlsx vs .json จากนามสกุลไฟล์ (file.name) ล้วนๆ ซึ่งพึ่งพาว่าเบราว์เซอร์/ระบบผู้ใช้รายงานชื่อไฟล์แบบมี
  // นามสกุลตรงเป๊ะเสมอ — error "PK...is not valid JSON" คือลายเซ็นไฟล์ ZIP (.xlsx คือไฟล์ ZIP ภายใน) โดน
  // ส่งเข้า JSON.parse ตรงๆ แปลว่าเคสนี้หลุดเงื่อนไข isExcel ไปลงทาง handleImportJson แทน — เปลี่ยนมาตรวจจาก
  // "เนื้อไฟล์จริง" (magic bytes) แทนนามสกุล ให้ผลลัพธ์แม่นยำ 100% ไม่ว่าชื่อไฟล์จะเป็นอะไร
  async function sniffIsSpreadsheet(file: File): Promise<boolean> {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    // .xlsx/.xlsm (Office Open XML) คือไฟล์ ZIP เสมอ ขึ้นต้นด้วย 'PK' (0x50 0x4B)
    const isZip = head[0] === 0x50 && head[1] === 0x4b
    // .xls แบบเก่า (Binary/OLE2) ขึ้นต้นด้วย signature นี้เสมอ
    const isOle2 = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0
    return isZip || isOle2
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    setError(null)
    setImportMessage(null)
    try {
      const isExcel = await sniffIsSpreadsheet(file)
      if (isExcel) {
        await handleImportExcel(file)
      } else {
        await handleImportJson(file)
      }
    } catch (err) {
      setError(`นำเข้าไฟล์ไม่สำเร็จ: ${getErrorMessage(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleImportJson(file: File) {
    const text = await file.text()
    const parsed = JSON.parse(text) as Partial<TemplateExport>
    if (parsed?.type !== 'fitlog-template' || typeof parsed.title !== 'string' || !Array.isArray(parsed.exercises)) {
      setError('ไฟล์นี้ไม่ใช่เทมเพลตที่รองรับ')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }

    const { data: newTemplate, error: tErr } = await supabase
      .from('workout_templates')
      .insert({ user_id: user.id, title: parsed.title })
      .select('*')
      .single()
    if (tErr || !newTemplate) {
      setError(`นำเข้าเทมเพลตไม่สำเร็จ: ${tErr?.message ?? 'unknown error'}`)
      return
    }
    const created = newTemplate as WorkoutTemplate

    if (parsed.exercises.length > 0) {
      const payload = parsed.exercises.map((ex, i) => ({
        template_id: created.id,
        user_id: user.id,
        position: i,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group ?? null,
        secondary_muscles: ex.secondary_muscles ?? [],
        exercise_library_id: ex.exercise_library_id ?? null,
        sets: ex.sets ?? null,
        target_reps: ex.target_reps ?? null,
        target_rir: ex.target_rir ?? null,
        rest: ex.rest ?? null,
        default_weight_kg: ex.default_weight_kg ?? null,
        notes: ex.notes ?? null,
      }))
      const { data: exRows, error: exErr } = await supabase.from('workout_template_exercises').insert(payload).select('*')
      if (exErr) {
        setError(`นำเข้าท่าไม่สำเร็จ: ${exErr.message}`)
      } else {
        setExercisesByTemplate((prev) => ({ ...prev, [created.id]: exRows as WorkoutTemplateExercise[] }))
      }
    }

    setTemplates((prev) => sortTemplates([created, ...prev]))
    setExpandedId(created.id)
    setImportMessage(`นำเข้า "${created.title}" (${parsed.exercises.length} ท่า) แล้ว`)
  }

  async function handleImportExcel(file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }

    // โหลด Exercise Library ก่อน parse เพื่อจับคู่ชื่อท่ากับกลุ่มกล้ามเนื้อ/ID ในคลังให้แม่นยำ — โหลดไม่สำเร็จ
    // ยัง parse ต่อได้ แค่ fallback ไปเดากลุ่มกล้ามเนื้อจากชื่อวันแทนทุกท่า (เหมือนหน้า /import)
    let exerciseLibrary: ExerciseDef[] = []
    try {
      exerciseLibrary = await getExerciseLibrary()
    } catch (libErr) {
      console.error('โหลด Exercise Library ไม่สำเร็จ ระหว่าง import เทมเพลตจาก Excel', libErr)
    }

    const buffer = await file.arrayBuffer()
    const parsedResult = parseWorkoutExcel(buffer, exerciseLibrary)
    if (parsedResult.days.length === 0) {
      setError('ไม่พบตารางท่าออกกำลังกายที่รูปแบบตรงกับที่รองรับในไฟล์นี้ (ต้องมีคอลัมน์ชื่อท่า และ Sets/Reps/RIR)')
      return
    }

    // ฟีดแบ็ก "อยาก import เข้าไปแทนเทมเพลตเดิมบางวันได้ไหม" — เดิม import สร้างเทมเพลตใหม่เสมอ (แม้ชื่อชีต
    // จะซ้ำกับเทมเพลตที่มีอยู่แล้วเป๊ะ ก็ได้เทมเพลตใหม่แยกซ้ำอีกใบ ไม่เคยแทนที่ของเดิม) — เลือกจับคู่ด้วย
    // "ชื่อ sheet ตรงกับชื่อเทมเพลตเป๊ะ" ตามที่ยืนยัน (workflow หลักคือ export ทั้งหมด -> แก้ในไฟล์เดิม (ไม่
    // เปลี่ยนชื่อชีต) -> import กลับ) วันที่ชื่อไม่ตรงกับเทมเพลตไหนเลย ยังสร้างใหม่เหมือนพฤติกรรมเดิมทุกประการ
    const nonEmptyDays = parsedResult.days.filter((d) => d.exercises.length > 0)
    const existingByTitle = new Map(templates.map((t) => [t.title, t]))
    let daysToReplace = nonEmptyDays.filter((d) => existingByTitle.has(d.title))
    const daysToCreate = nonEmptyDays.filter((d) => !existingByTitle.has(d.title))

    // แทนที่ = ลบท่าเดิมทั้งหมดของเทมเพลตนั้นทิ้งแล้วเขียนท่าจากไฟล์แทน ย้อนกลับไม่ได้ — ต้องถามยืนยันก่อน
    // เหมือนจุดอื่นที่ลบข้อมูลถาวร (ดู handleDeleteTemplate) ถามครั้งเดียวรวมทุกชื่อที่ชนกัน ไม่ใช่ทีละชื่อ
    // เพื่อไม่ให้กดยืนยันรัวๆ ตอนไฟล์มีหลายวัน — กด "ยกเลิก" แปลว่าข้ามเทมเพลตที่ชื่อตรงกันทั้งหมดไปเลย (ไม่
    // สร้างซ้ำ ไม่แทนที่) เหลือแค่วันที่ชื่อใหม่จริงๆ ที่ยัง import ต่อได้ตามปกติ
    if (daysToReplace.length > 0) {
      const names = daysToReplace.map((d) => `"${d.title}"`).join(', ')
      const confirmed = window.confirm(
        `ไฟล์นี้มีชื่อชีตตรงกับเทมเพลตที่มีอยู่แล้ว ${daysToReplace.length} รายการ: ${names}\n\n` +
          `กด "ตกลง" เพื่อแทนที่ท่าออกกำลังกายเดิมของเทมเพลตเหล่านี้ทั้งหมดด้วยข้อมูลจากไฟล์นี้ (ย้อนกลับไม่ได้)\n` +
          `กด "ยกเลิก" เพื่อข้ามเทมเพลตที่ชื่อตรงกันไป แล้วนำเข้าเฉพาะเทมเพลตใหม่ที่เหลือแทน`
      )
      if (!confirmed) daysToReplace = []
    }

    const createdTemplates: WorkoutTemplate[] = []
    const updatedExercisesByTemplate: Record<string, WorkoutTemplateExercise[]> = {}
    let totalCreatedExercises = 0
    let totalReplacedExercises = 0

    for (const day of daysToReplace) {
      const target = existingByTitle.get(day.title)!
      const { error: delErr } = await supabase.from('workout_template_exercises').delete().eq('template_id', target.id)
      if (delErr) {
        setError(`แทนที่เทมเพลต "${day.title}" ไม่สำเร็จ: ${delErr.message}`)
        return
      }

      const payload = day.exercises.map((ex, i) => ({
        template_id: target.id,
        user_id: user.id,
        position: i,
        exercise_name: ex.name,
        muscle_group: ex.muscleGroup,
        secondary_muscles: ex.secondaryMuscles,
        exercise_library_id: ex.matchedExerciseId,
        sets: ex.sets,
        target_reps: ex.targetRepsRaw ?? (ex.reps !== null ? String(ex.reps) : null),
        target_rir: ex.targetRirRaw ?? (ex.rir !== null ? String(ex.rir) : null),
        rest: ex.restRaw,
        default_weight_kg: ex.weight_kg,
        notes: ex.notes,
      }))
      const { data: exRows, error: exErr } = await supabase.from('workout_template_exercises').insert(payload).select('*')
      if (exErr) {
        setError(`บันทึกท่าของเทมเพลต "${day.title}" ไม่สำเร็จ: ${exErr.message}`)
        return
      }

      updatedExercisesByTemplate[target.id] = exRows as WorkoutTemplateExercise[]
      totalReplacedExercises += day.exercises.length
    }

    for (const day of daysToCreate) {
      const { data: newTemplate, error: tErr } = await supabase
        .from('workout_templates')
        .insert({ user_id: user.id, title: day.title })
        .select('*')
        .single()
      if (tErr || !newTemplate) {
        setError(`สร้างเทมเพลต "${day.title}" ไม่สำเร็จ: ${tErr?.message ?? 'unknown error'}`)
        return
      }
      const created = newTemplate as WorkoutTemplate

      const payload = day.exercises.map((ex, i) => ({
        template_id: created.id,
        user_id: user.id,
        position: i,
        exercise_name: ex.name,
        muscle_group: ex.muscleGroup,
        secondary_muscles: ex.secondaryMuscles,
        exercise_library_id: ex.matchedExerciseId,
        sets: ex.sets,
        target_reps: ex.targetRepsRaw ?? (ex.reps !== null ? String(ex.reps) : null),
        target_rir: ex.targetRirRaw ?? (ex.rir !== null ? String(ex.rir) : null),
        rest: ex.restRaw,
        default_weight_kg: ex.weight_kg,
        notes: ex.notes,
      }))
      const { data: exRows, error: exErr } = await supabase.from('workout_template_exercises').insert(payload).select('*')
      if (exErr) {
        setError(`บันทึกท่าของเทมเพลต "${day.title}" ไม่สำเร็จ: ${exErr.message}`)
        return
      }

      createdTemplates.push(created)
      updatedExercisesByTemplate[created.id] = exRows as WorkoutTemplateExercise[]
      totalCreatedExercises += day.exercises.length
    }

    if (createdTemplates.length > 0) setTemplates((prev) => sortTemplates([...createdTemplates, ...prev]))
    setExercisesByTemplate((prev) => ({ ...prev, ...updatedExercisesByTemplate }))
    if (createdTemplates.length === 1 && daysToReplace.length === 0) setExpandedId(createdTemplates[0].id)

    // รวม warning จาก parser (fuzzy match/ไม่พบท่าในคลัง/แปลงหน่วยปอนด์) ต่อท้ายสรุปผล ให้ผู้ใช้รู้ว่าท่าไหน
    // ควรตรวจสอบเพิ่ม แทนที่จะดูเหมือนนำเข้าสำเร็จสมบูรณ์ 100% เงียบๆ
    const summaryParts: string[] = []
    if (daysToReplace.length > 0) summaryParts.push(`แทนที่ ${daysToReplace.length} เทมเพลต (${totalReplacedExercises} ท่า)`)
    if (createdTemplates.length > 0) summaryParts.push(`สร้างใหม่ ${createdTemplates.length} เทมเพลต (${totalCreatedExercises} ท่า)`)
    const summary =
      summaryParts.length > 0 ? `${summaryParts.join(' · ')} จาก "${file.name}" แล้ว` : `ไม่มีเทมเพลตถูกนำเข้าจาก "${file.name}"`
    setImportMessage(parsedResult.warnings.length > 0 ? `${summary} — ${parsedResult.warnings.join(' ')}` : summary)
  }

  async function handleAddExercise(
    templateId: string,
    fields: {
      name: string
      sets: string
      reps: string
      rir: string
      rest: string
      notes: string
      muscleGroup: MuscleGroup
      secondaryMuscles: string[]
      exerciseLibraryId: string | null
    }
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const position = (exercisesByTemplate[templateId] ?? []).length

    const { data, error: err } = await supabase
      .from('workout_template_exercises')
      .insert({
        template_id: templateId,
        user_id: user.id,
        position,
        exercise_name: fields.name,
        muscle_group: fields.muscleGroup,
        secondary_muscles: fields.secondaryMuscles,
        exercise_library_id: fields.exerciseLibraryId,
        sets: fields.sets ? Number(fields.sets) : null,
        target_reps: fields.reps || null,
        target_rir: fields.rir || null,
        rest: fields.rest || null,
        notes: fields.notes || null,
      })
      .select('*')
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setExercisesByTemplate((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] ?? []), data as WorkoutTemplateExercise],
    }))
    setAddingToId(null)
  }

  async function handleDeleteExercise(ex: WorkoutTemplateExercise) {
    setError(null)
    const { error: err } = await supabase.from('workout_template_exercises').delete().eq('id', ex.id)
    if (err) {
      setError(`ลบท่าไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByTemplate((prev) => ({
      ...prev,
      [ex.template_id]: (prev[ex.template_id] ?? []).filter((e) => e.id !== ex.id),
    }))
  }

  // บั๊ก (ไล่ตรวจทั้งโปรเจครอบใหม่ — grep หา pattern เดียวกับที่เจอใน /program) "เดิม update local state
  // ก่อนยิง DB แล้วไม่มี rollback ถ้าพัง — ต่างจาก handleDeleteExercise ด้านบนที่ await/เช็ค error ก่อนค่อย
  // update state เสมอ" — สลับเป็น DB สำเร็จก่อนค่อย update state เหมือนกัน
  async function handleUpdateExercise(ex: WorkoutTemplateExercise, patch: Partial<WorkoutTemplateExercise>) {
    setError(null)
    const { error: err } = await supabase.from('workout_template_exercises').update(patch).eq('id', ex.id)
    if (err) {
      setError(`แก้ไขท่าไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByTemplate((prev) => ({
      ...prev,
      [ex.template_id]: (prev[ex.template_id] ?? []).map((e) => (e.id === ex.id ? { ...e, ...patch } : e)),
    }))
  }

  // reorder ต้องรู้สึกทันทีตอนลาก (ต่างจาก handleUpdateExercise ด้านบนที่รอ DB ก่อนได้ ไม่กระทบ interaction)
  // — คง optimistic update ไว้ แต่เก็บลำดับเดิมไว้ rollback ถ้า DB เขียนพัง แทนที่จะปล่อยให้ UI ค้างลำดับใหม่
  // ทั้งที่ DB ยังเป็นลำดับเก่า (หรือ update สำเร็จแค่บางท่าเพราะเป็นหลาย write ใน Promise.all เดียว)
  async function handleReorderExercises(templateId: string, reordered: WorkoutTemplateExercise[]) {
    const previous = exercisesByTemplate[templateId] ?? []
    setExercisesByTemplate((prev) => ({ ...prev, [templateId]: reordered }))
    const { error: err } = await Promise.all(
      reordered.map((ex, i) => supabase.from('workout_template_exercises').update({ position: i }).eq('id', ex.id))
    ).then(
      (results) => ({ error: results.find((r) => r.error)?.error ?? null }),
      (e) => ({ error: e })
    )
    if (err) {
      setError(`เรียงลำดับท่าไม่สำเร็จ: ${getErrorMessage(err)}`)
      setExercisesByTemplate((prev) => ({ ...prev, [templateId]: previous }))
    }
  }

  async function handleStart(template: WorkoutTemplate) {
    const exercises = exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setStartingId(template.id)
    setStartMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const { error: wErrMessage, count } = await startTemplateAsWorkoutLog(supabase, user.id, exercises)
      if (wErrMessage) {
        setError(`เริ่ม "${template.title}" ไม่สำเร็จ: ${wErrMessage}`)
        return
      }

      setStartMessage(`บันทึก "${template.title}" (${count} ท่า) เข้า Log วันนี้แล้ว`)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
    } finally {
      setStartingId(null)
    }
  }

  async function ensureProgramDay(dow: number, userId: string): Promise<ProgramDay | null> {
    const { data: existing, error: findErr } = await supabase
      .from('program_days')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dow)
      .maybeSingle()

    if (findErr) {
      setError(findErr.message)
      return null
    }
    if (existing) return existing as ProgramDay

    const { data, error: err } = await supabase
      .from('program_days')
      .upsert({ user_id: userId, day_of_week: dow, title: `วัน${WEEKDAYS[dow]}` }, { onConflict: 'user_id,day_of_week' })
      .select('*')
      .single()

    if (err || !data) {
      setError(err?.message ?? 'สร้างวันไม่สำเร็จ')
      return null
    }
    return data as ProgramDay
  }

  async function handleApplyToProgram(template: WorkoutTemplate, dow: number) {
    const exercises = exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setApplyingId(template.id)
    setApplyMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const day = await ensureProgramDay(dow, user.id)
      if (!day) return

      const { count, error: countErr } = await supabase
        .from('program_exercises')
        .select('*', { count: 'exact', head: true })
        .eq('program_day_id', day.id)

      if (countErr) {
        setError(countErr.message)
        return
      }
      const startPosition = count ?? 0

      const payload = exercises.map((ex, i) => ({
        program_day_id: day.id,
        user_id: user.id,
        position: startPosition + i,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        target_reps: ex.target_reps,
        target_rir: ex.target_rir,
        rest: ex.rest,
        rationale: ex.notes,
      }))

      const { error: insErr } = await supabase.from('program_exercises').insert(payload)
      if (insErr) {
        setError(`ตั้งโปรแกรมไม่สำเร็จ: ${insErr.message}`)
        return
      }

      setApplyMessage(`เพิ่ม ${payload.length} ท่าจาก "${template.title}" เข้าโปรแกรมวัน${WEEKDAYS[dow]}แล้ว`)
      setApplyPickerId(null)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${getErrorMessage(err)}`)
    } finally {
      setApplyingId(null)
    }
  }

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดเทมเพลตไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="relative">
      {/* พื้นหลังทั้งหน้า — แนว Dark Titanium: แสงไฮไลต์เป็นกลาง (ขาว ไม่ใช่สี) เหมือนแสงสตูดิโอส่องแผ่นโลหะ
          + gradient เข้ม + noise บางๆ (พื้นผิวแบบโลหะขัดหยาบ) ไม่ใช้ glow สีเหมือนก่อนหน้า เพราะแข่งกับรูปกล้ามเนื้อ */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at top, rgba(255,255,255,.05), transparent 40%)',
              'linear-gradient(180deg, #0d0d10, #0b0b0d)',
            ].join(', '),
          }}
        />
        <div className="absolute inset-0" style={{ backgroundImage: NOISE_BG, opacity: 0.04, mixBlendMode: 'overlay' }} />
      </div>

      <div className="space-y-3 lg:max-w-3xl lg:mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl tracked uppercase">เทมเพลต</h1>
          <p className="text-sm text-muted mt-1">กดเริ่มได้ทุกเมื่อ ไม่ผูกกับวันในสัปดาห์</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {/* ฟีดแบ็ก "อยาก export ทุกเทมเพลตเป็น excel 1 ไฟล์ แต่แยกตาม sheet เพื่อเอาไปวิเคราะห์และแก้ไขท่า"
              — ปุ่มรวม ต่างจาก "⬇ Export" ต่อการ์ด (handleExportTemplate, ยังคงเป็น .json ทีละเทมเพลตเหมือนเดิม
              ไม่แตะ) ปุ่มนี้ export ทุกเทมเพลตพร้อมกันเป็น .xlsx ไฟล์เดียว 1 sheet ต่อเทมเพลต */}
          <button
            type="button"
            onClick={handleExportAllToExcel}
            disabled={exportingAll || templates.length === 0}
            className="inline-flex items-center gap-1.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-amber hover:border-amber/50 transition disabled:opacity-40"
          >
            {exportingAll ? '...' : '📊 Export ทั้งหมด (.xlsx)'}
          </button>
          <a
            href="/exercises"
            className="inline-flex items-center gap-1.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-amber hover:border-amber/50 transition"
          >
            🔍 ฐานข้อมูลท่า
          </a>
          <a
            href="/history"
            className="inline-flex items-center gap-1.5 text-[12px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-amber hover:border-amber/50 transition"
          >
            🕐 ดูประวัติ
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {startMessage && <p className="text-sm text-steel">{startMessage}</p>}
      {applyMessage && <p className="text-sm text-steel">{applyMessage}</p>}
      {importMessage && <p className="text-sm text-steel">{importMessage}</p>}

      {templates.length === 0 && !creating && (
        <PremiumCard className="px-4 py-8 text-center" style={{ border: `1px dashed ${CARD_BORDER_CSS}` }}>
          <p className="text-sm text-muted mb-3">ยังไม่มีเทมเพลต</p>
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2 transition active:scale-[0.98] hover:opacity-90"
          >
            + สร้างเทมเพลตแรก
          </button>
        </PremiumCard>
      )}

      {templates.map((t, i) => {
          const exercises = exercisesByTemplate[t.id] ?? []
          const expanded = expandedId === t.id
          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length]
          const icon = iconForTemplate(t.title, i)
          return (
            <div
              key={t.id}
              className="relative animate-rise"
              style={{ animationDuration: '350ms', animationDelay: `${i * 60}ms` }}
            >
              {/* เงาของการ์ดต้องอยู่ที่ "ห่อนอก" ใบนี้ (ไม่มี overflow-hidden) — overflow-hidden จะไปตัด
                  box-shadow ของ "ตัวเอง" ทิ้งด้วย เลยแยกเป็น 2 ชั้น: ห่อนอกคุมขอบ/เงา, ห่อในคุม
                  overflow-hidden สำหรับพื้นหลัง/รูปที่ต้องโค้งตามการ์ด — ขอบรอบการ์ดตอนนี้เป็น "gradient
                  border" (สว่างด้านบน มืดด้านล่าง จำลองผิวโลหะจริง) แทนเส้นสีเทาแบนเดิม ใช้เทคนิค
                  background 2 เลเยอร์ + backgroundClip (border ธรรมดาไล่สีไม่ได้ตรงๆ) ส่วนสีต่อวันย้าย
                  ไปอยู่ที่เส้น "energy line" ในห่อในแทนที่จะเป็นขอบซ้ายทึบเหมือนก่อน */}
              <div
                className="rounded-3xl"
                style={{
                  border: '1px solid transparent',
                  backgroundImage: [
                    'linear-gradient(#1A1C21, #1A1C21)',
                    'linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.45))',
                  ].join(', '),
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                  boxShadow: [
                    '0 20px 45px rgba(0,0,0,.5)',
                    '0 1px 0 rgba(255,255,255,.05)',
                    `-6px 0 18px ${withAlpha(accent, '2E')}`,
                  ].join(', '),
                }}
              >
                <div
                  className="relative rounded-3xl overflow-hidden"
                  style={{
                    backgroundImage: [
                      // สีของรูป/ขอบซ้ายไหลเข้าไปในเนื้อการ์ดบางๆ ให้รูปกับการ์ดรู้สึกเป็นชิ้นเดียวกัน
                      // แทนที่จะเป็นจุดสี (ไอคอน) กับเส้นสี (ขอบ) ที่แยกจากกันคนละจุด
                      `radial-gradient(ellipse 220px 160px at 0% 45%, ${withAlpha(accent, '26')}, transparent 70%)`,
                      // แสงกลางการ์ดจางๆ กันไม่ให้เนื้อการ์ดมืดตันเป็นสีทึบเดียวตรงกลาง
                      'radial-gradient(circle at 30% 50%, rgba(255,255,255,.03), transparent 45%)',
                      'linear-gradient(180deg, #2B2D34, #1C1E23)',
                    ].join(', '),
                    boxShadow: ['inset 0 1px 0 rgba(255,255,255,.08)', 'inset 0 -1px 0 rgba(0,0,0,.5)'].join(', '),
                  }}
                >
                  {/* Energy line — เส้นสีต่อวันบางๆ ที่ขอบซ้าย ไล่จากสว่าง (บน) ไปจาง (ล่าง) แทนแถบสีทึบ
                      เรียบๆ เหมือนก่อน ให้ความรู้สึกเป็นเส้นพลังงานมากกว่าเส้นบอกหมวดหมู่ธรรมดา */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none"
                    style={{
                      background: `linear-gradient(180deg, ${lighten(accent, 0.25)} 0%, ${accent} 45%, ${withAlpha(accent, '33')} 100%)`,
                      boxShadow: `0 0 8px ${withAlpha(accent, '80')}`,
                    }}
                    aria-hidden="true"
                  />
                  {/* glass reflection — ไล่ขาวจางๆ จากขอบบน ให้พื้นผิวดูมีมิติแทนสีทึบราบเรียบ */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.05), transparent 22%)' }}
                    aria-hidden="true"
                  />
                  <div className="relative px-3.5 py-3.5 border-b border-line flex items-center gap-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      {/* ไอคอนวงกลม: glow ด้านหลังหายใจเบาๆ (layer แยก ไม่แตะตัวรูป) + วงเบเซลโลหะนิ่ง
                          + highlight บนพื้นหลังผสมสีต่อวัน (mix-blend-mode: screen) ให้ดูเหมือนมีไฟอยู่
                          ข้างใน + รูปซูมเข้า 15% ให้กล้ามเนื้อเต็มวงมากกว่าเดิม */}
                      <span className="relative shrink-0 w-20 h-20 flex items-center justify-center">
                        <span
                          className="absolute inset-0 rounded-full animate-icon-glow-breathe pointer-events-none"
                          style={{ background: `radial-gradient(circle, ${withAlpha(accent, '66')}, transparent 70%)`, filter: 'blur(14px)' }}
                          aria-hidden="true"
                        />
                        <span
                          className="relative w-full h-full rounded-full flex items-center justify-center"
                          style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.15), 0 6px 14px rgba(0,0,0,.55)' }}
                          aria-hidden="true"
                        >
                          <span
                            className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                            style={{ background: `radial-gradient(circle at 35% 30%, ${lighten(accent, 0.15)}, #2A2C31)` }}
                          >
                            <Image
                              src={icon}
                              alt=""
                              width={80}
                              height={80}
                              className="w-full h-full object-cover"
                              style={{ transform: 'scale(1.15)' }}
                            />
                            {/* rim light มุมบนซ้าย — เส้นแสงขาวบางๆ จำลองแสงตกกระทบ ให้รูปดูมีมิติ 3 มิติ
                                ขึ้น แยกจาก inner glow สีต่อวันด้านล่าง (คนละทิศ คนละสี ซ้อนกันได้พอดี) */}
                            <span
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,.35) 0%, transparent 35%)',
                                mixBlendMode: 'screen',
                              }}
                            />
                            <span
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{
                                background: `radial-gradient(circle at 50% 40%, ${withAlpha(accent, '4D')}, transparent 60%)`,
                                mixBlendMode: 'screen',
                              }}
                            />
                          </span>
                        </span>
                      </span>
                      <span className="min-w-0">
                        {(() => {
                          const split = splitTitle(t.title)
                          return split ? (
                            <p className="text-xs font-display tracked uppercase leading-snug">
                              <span style={{ fontWeight: 600, color: accent }}>{split[0]} —</span>{' '}
                              <span className="text-ink" style={{ fontWeight: 800 }}>
                                {split[1]}
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-ink font-display tracked uppercase leading-snug" style={{ fontWeight: 800 }}>
                              {t.title}
                            </p>
                          )
                        })()}
                        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
                          🕐 {exercises.length} ท่า
                        </p>
                      </span>
                    </button>
                    <button
                      onClick={() => handleStart(t)}
                      disabled={startingId === t.id || exercises.length === 0}
                      className="shrink-0 w-[92px] rounded-[18px] text-[12px] leading-tight font-display tracked uppercase text-bg py-2 px-3 text-center active:scale-[0.99] disabled:opacity-40 transition"
                      style={{
                        backgroundImage: [
                          'linear-gradient(180deg, rgba(255,255,255,.35), transparent 55%)',
                          'linear-gradient(180deg, #FFDA8C 0%, #FFC94B 40%, #FF9700 100%)',
                        ].join(', '),
                        boxShadow: 'inset 0 2px 0 rgba(255,255,255,.4), inset 0 -2px 0 rgba(0,0,0,.25), 0 4px 9px rgba(255,150,0,.23)',
                      }}
                    >
                      {startingId === t.id ? '...' : `Start ${t.title}`}
                    </button>
                  </div>

              {expanded && (
                <>
                  <ExerciseList
                    exercises={exercises}
                    onUpdate={handleUpdateExercise}
                    onDelete={handleDeleteExercise}
                    onReorder={(reordered) => handleReorderExercises(t.id, reordered)}
                  />
                  <div className="px-4 py-3 border-t border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <button
                      onClick={() => setAddingToId(t.id)}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
                    >
                      + เพิ่มท่า
                    </button>
                    <button
                      onClick={() => setApplyPickerId(applyPickerId === t.id ? null : t.id)}
                      disabled={exercises.length === 0}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition disabled:opacity-40"
                    >
                      📅 ตั้งโปรแกรม
                    </button>
                    <button
                      onClick={() => handleExportTemplate(t)}
                      disabled={exercises.length === 0}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition disabled:opacity-40"
                    >
                      ⬇ Export
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id, t.title)} className="text-xs text-muted hover:text-rust transition">
                      ลบเทมเพลตนี้
                    </button>
                  </div>
                  {applyPickerId === t.id && (
                    <div className="px-4 pb-4 space-y-2">
                      <p className="text-[12px] text-muted">เลือกวันในสัปดาห์ที่จะใส่ท่าจากเทมเพลตนี้เข้าไป (เพิ่มต่อท้ายถ้าวันนั้นมีท่าอยู่แล้ว)</p>
                      <div className="grid grid-cols-7 gap-1">
                        {WEEKDAYS_SHORT.map((label, dow) => (
                          <button
                            key={dow}
                            onClick={() => handleApplyToProgram(t, dow)}
                            disabled={applyingId === t.id}
                            className="rounded-lg py-2.5 text-xs font-display tracked uppercase bg-surface2 text-ink border border-line hover:border-amber transition disabled:opacity-40"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {applyingId === t.id && <p className="text-[12px] text-muted">กำลังตั้งโปรแกรม...</p>}
                    </div>
                  )}
                  {addingToId === t.id && (
                    <div className="px-4 pb-4">
                      <AddExerciseForm onCancel={() => setAddingToId(null)} onSubmit={(fields) => handleAddExercise(t.id, fields)} />
                    </div>
                  )}
                </>
              )}
                </div>
              </div>
            </div>
          )
        })}

      {!creating && (
        <div className="flex gap-3">
          {templates.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="flex-1 rounded-3xl border border-dashed py-3.5 px-3 text-center transition active:scale-[0.99]"
              style={{ borderColor: withAlpha(COLORS.amber, '66'), color: COLORS.amber }}
            >
              <span className="block font-display text-sm tracked uppercase">+ เทมเพลตใหม่</span>
              <span className="block text-[12px] text-muted mt-1 normal-case">สร้างโปรแกรมของคุณเอง</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 rounded-3xl border border-dashed py-3.5 px-3 text-center transition active:scale-[0.99] disabled:opacity-40"
            style={{ borderColor: withAlpha(COLORS.steel, '66'), color: COLORS.steel }}
          >
            <span className="block font-display text-sm tracked uppercase">{importing ? '...' : '⬆ Import'}</span>
            <span className="block text-[12px] text-muted mt-1 normal-case">นำเข้าเทมเพลตจาก .json หรือ .xlsx</span>
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.xlsx,.xls" onChange={handleImportFile} className="hidden" />
        </div>
      )}

      {creating && <NewTemplateForm onCancel={() => setCreating(false)} onSubmit={handleCreateTemplate} />}
      </div>
    </div>
  )
}

function ExerciseList({
  exercises,
  onUpdate,
  onDelete,
  onReorder,
}: {
  exercises: WorkoutTemplateExercise[]
  onUpdate: (ex: WorkoutTemplateExercise, patch: Partial<WorkoutTemplateExercise>) => void
  onDelete: (ex: WorkoutTemplateExercise) => void
  onReorder: (reordered: WorkoutTemplateExercise[]) => void
}) {
  const [items, setItems] = useState(exercises)
  const itemsRef = useRef(exercises)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const dragIndexRef = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    setItems(exercises)
    itemsRef.current = exercises
  }, [exercises])

  const handleMove = useCallback((e: PointerEvent) => {
    const from = dragIndexRef.current
    if (from === null) return
    let to = from
    rowRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        to = itemsRef.current.findIndex((it) => it.id === id)
      }
    })
    if (to !== from && to >= 0) {
      const next = [...itemsRef.current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      itemsRef.current = next
      dragIndexRef.current = to
      setItems(next)
    }
  }, [])

  const handleUp = useCallback(() => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    dragIndexRef.current = null
    setDraggingId(null)
    onReorder(itemsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMove])

  function handleDown(e: React.PointerEvent, index: number, id: string) {
    e.preventDefault()
    dragIndexRef.current = index
    setDraggingId(id)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <ul>
      {items.map((ex, index) => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          rowRef={(el) => {
            if (el) rowRefs.current.set(ex.id, el)
            else rowRefs.current.delete(ex.id)
          }}
          dragging={draggingId === ex.id}
          editing={editingId === ex.id}
          onDragHandleDown={(e) => handleDown(e, index, ex.id)}
          onToggleEdit={() => setEditingId((cur) => (cur === ex.id ? null : ex.id))}
          onUpdate={(patch) => onUpdate(ex, patch)}
          onDelete={() => onDelete(ex)}
        />
      ))}
    </ul>
  )
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      {[3, 7, 11].map((cy) => (
        <g key={cy}>
          <circle cx="4" cy={cy} r="1.3" fill="currentColor" />
          <circle cx="10" cy={cy} r="1.3" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

function ExerciseRow({
  exercise,
  rowRef,
  dragging,
  editing,
  onDragHandleDown,
  onToggleEdit,
  onUpdate,
  onDelete,
}: {
  exercise: WorkoutTemplateExercise
  rowRef: (el: HTMLLIElement | null) => void
  dragging: boolean
  editing: boolean
  onDragHandleDown: (e: React.PointerEvent) => void
  onToggleEdit: () => void
  onUpdate: (patch: Partial<WorkoutTemplateExercise>) => void
  onDelete: () => void
}) {
  return (
    <li
      ref={rowRef}
      className={`tally-row px-4 py-2.5 flex items-start gap-2 ${dragging ? 'opacity-50' : ''}`}
    >
      <span
        onPointerDown={onDragHandleDown}
        className="mt-0.5 text-muted hover:text-amber shrink-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <DragHandleIcon />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink truncate">{exercise.exercise_name}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onToggleEdit} className="text-[12px] text-muted hover:text-amber transition">
              {editing ? 'เสร็จ' : 'แก้ไข'}
            </button>
            <button onClick={onDelete} className="text-[12px] text-muted hover:text-rust transition">
              ลบ
            </button>
          </div>
        </div>

        {!editing && (
          <p className="text-[12px] text-muted mt-0.5">
            {exercise.sets ?? '–'} เซ็ต × {exercise.target_reps ?? '–'} reps
            {exercise.target_rir && ` · RIR ${exercise.target_rir}`}
            {exercise.rest && ` · พัก ${exercise.rest}`}
          </p>
        )}
        {!editing && exercise.notes && <p className="text-[12px] text-muted/70 mt-1 italic">{exercise.notes}</p>}

        {editing && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <BlurField
                label="เซ็ต"
                value={exercise.sets != null ? String(exercise.sets) : ''}
                onBlur={(v) => onUpdate({ sets: v ? Number(v) : null })}
              />
              <BlurField
                label="Target Reps"
                value={exercise.target_reps ?? ''}
                onBlur={(v) => onUpdate({ target_reps: v || null })}
              />
              <BlurField
                label="Target RIR"
                value={exercise.target_rir ?? ''}
                onBlur={(v) => onUpdate({ target_rir: v || null })}
              />
              <BlurField label="พัก" value={exercise.rest ?? ''} onBlur={(v) => onUpdate({ rest: v || null })} />
            </div>
            {/* Product Audit /program+/templates — เปลี่ยนจาก native <select> เป็น chip row แบบเดียวกับ
                /log ให้เลือกกลุ่มกล้ามเนื้อด้วยวิธีเดียวกันทั้งแอป (ไม่แตะ state/logic ใดๆ) */}
            <div>
              <p className="text-[12px] tracked uppercase text-muted mb-1">กลุ่มกล้ามเนื้อ</p>
              <div className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((mg) => (
                  <button
                    key={mg}
                    type="button"
                    onClick={() => onUpdate({ muscle_group: mg })}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${
                      ((exercise.muscle_group as MuscleGroup) ?? 'อื่นๆ') === mg
                        ? 'bg-steel text-bg border-steel'
                        : 'bg-surface2 border-line text-muted hover:text-ink hover:border-amber/50'
                    }`}
                  >
                    {mg}
                  </button>
                ))}
              </div>
            </div>
            <BlurTextArea label="Rationale (คำแนะนำในการเล่น)" value={exercise.notes ?? ''} onBlur={(v) => onUpdate({ notes: v || null })} />
          </div>
        )}
      </div>
    </li>
  )
}

function BlurField({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[12px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        className="w-full bg-surface2 text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}

function BlurTextArea({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[12px] tracked uppercase text-muted mb-0.5">{label}</span>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        rows={2}
        placeholder="เช่น เกร็งแกนกลางลำตัว ควบคุมจังหวะขาลง ไม่ใช้แรงเหวี่ยง"
        className="w-full bg-surface2 text-ink text-xs rounded px-2 py-1.5 border border-line outline-none focus:border-amber resize-none"
      />
    </label>
  )
}

function NewTemplateForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <PremiumCard className="px-4 py-4 space-y-3">
      <p className="text-sm text-ink font-display tracked uppercase">เทมเพลตใหม่</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="เช่น Push Day"
        className="w-full bg-surface2 text-ink text-sm rounded px-3 py-2 border border-line outline-none focus:border-amber"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs transition active:scale-[0.98] hover:bg-white/5">
          ยกเลิก
        </button>
        <button
          onClick={() => title.trim() && onSubmit(title.trim())}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs transition active:scale-[0.99] hover:opacity-90"
        >
          สร้าง แล้วเพิ่มท่า
        </button>
      </div>
    </PremiumCard>
  )
}

function AddExerciseForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (fields: {
    name: string
    sets: string
    reps: string
    rir: string
    rest: string
    notes: string
    muscleGroup: MuscleGroup
    secondaryMuscles: string[]
    exerciseLibraryId: string | null
  }) => void
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [rest, setRest] = useState('')
  const [notes, setNotes] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('อื่นๆ')
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [exerciseLibraryId, setExerciseLibraryId] = useState<string | null>(null)

  return (
    <div className="rounded-lg bg-surface2 border border-line px-3 py-3 space-y-2">
      <ExercisePicker
        value={name}
        onChange={(v) => {
          setName(v)
          // บั๊ก (ไล่ตรวจทั้งโปรเจครอบใหม่ — grep หา pattern เดียวกับที่เจอใน /program) "เดิมเคลียร์แค่
          // exerciseLibraryId — เลือก suggestion แล้วแก้ชื่อต่อ muscleGroup/secondaryMuscles ของท่าที่เลือก
          // ไว้ตอนแรกยังค้างอยู่ ทั้งที่ชื่อไม่ตรงกับท่านั้นแล้ว (ฟอร์มนี้ไม่มี UI ให้แก้ secondaryMuscles เลย)
          // — ต้อง reset ทั้งคู่กลับเป็นค่าเริ่มต้นพร้อมกับ FK
          setExerciseLibraryId(null)
          setMuscleGroup('อื่นๆ')
          setSecondaryMuscles([])
        }}
        onSelect={(ex: ExerciseDef) => {
          setMuscleGroup(ex.muscleGroup)
          setSecondaryMuscles(ex.secondaryMuscles)
          setExerciseLibraryId(ex.id)
        }}
        placeholder="ชื่อท่า"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <MiniField label="เซ็ต" value={sets} onChange={setSets} />
        <MiniField label="Target Reps" value={reps} onChange={setReps} />
        <MiniField label="Target RIR" value={rir} onChange={setRir} />
        <MiniField label="พัก" value={rest} onChange={setRest} />
      </div>
      {/* Product Audit /program+/templates — ฟีดแบ็ก "เลือกกลุ่มกล้ามเนื้อด้วย native <select> ต่างจาก
          /log ที่ใช้ chip row สำหรับงานเดียวกันเป๊ะ (MUSCLE_GROUPS ชุดเดียวกัน)" — เปลี่ยนเป็น chip row
          แบบเดียวกับ /log ให้ทั้งแอปเลือกกลุ่มกล้ามเนื้อด้วยวิธีเดียวกัน (ไม่แตะ state/logic ใดๆ) */}
      <div>
        <p className="text-[12px] tracked uppercase text-muted mb-1">กลุ่มกล้ามเนื้อ</p>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg}
              type="button"
              onClick={() => setMuscleGroup(mg)}
              className={`text-xs px-2.5 py-1.5 rounded-full border transition ${
                muscleGroup === mg
                  ? 'bg-steel text-bg border-steel'
                  : 'bg-surface2 border-line text-muted hover:text-ink hover:border-amber/50'
              }`}
            >
              {mg}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="block text-[12px] tracked uppercase text-muted mb-0.5">Rationale (คำแนะนำในการเล่น)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="เช่น เกร็งแกนกลางลำตัว ควบคุมจังหวะขาลง ไม่ใช้แรงเหวี่ยง"
          className="w-full bg-surface text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber resize-none"
        />
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2 text-[12px] transition active:scale-[0.98] hover:bg-white/5">
          ยกเลิก
        </button>
        <button
          onClick={() =>
            name.trim() && onSubmit({ name: name.trim(), sets, reps, rir, rest, notes, muscleGroup, secondaryMuscles, exerciseLibraryId })
          }
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2 text-[12px] transition active:scale-[0.99] hover:opacity-90"
        >
          เพิ่มท่านี้
        </button>
      </div>
    </div>
  )
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[12px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}
