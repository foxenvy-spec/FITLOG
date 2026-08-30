'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS_EN, type MuscleGroup } from '@/lib/muscle-groups'
import { COLORS, CARD_GRADIENT_CSS, TITANIUM_MESH_CSS, CARD_BORDER_CSS, withAlpha } from '@/lib/theme'

// ฟีดแบ็ก "Power-User Feature — Ctrl+K/Cmd+K แล้วมีแถบค้นหาเร็ว: พิมพ์ log → พาไปหน้าบันทึกทันที, พิมพ์
// chest → แสดงประวัติท่าเล่นอก, พิมพ์ ask → เด้งกล่องถาม AI MINT ทันที" — สโคปแรก: คำสั่งนำทางคงที่
// (ทุกหน้าในแอป) + กลุ่มกล้ามเนื้อ (deep link เข้า /exercises?muscle=... — เพิ่ม query param รองรับใน
// app/(app)/exercises/page.tsx คู่กัน) ไม่ได้ทำ full-text search ข้ามประวัติ workout ทั้งหมด (ขอบเขตใหญ่
// กว่ามาก ต้องมี index/UI แยกต่างหาก) — ยิงจากทุกหน้าในแอป (mount ที่ app/(app)/layout.tsx) เพราะเป็น
// power-user shortcut ที่ควรใช้ได้ไม่ว่าจะอยู่หน้าไหน ไม่ใช่แค่ Dashboard
interface Command {
  id: string
  label: string
  hint?: string
  keywords: string[]
  href: string
  icon: string
}

const NAV_COMMANDS: Command[] = [
  { id: 'dashboard', label: 'หน้าแรก', hint: 'Dashboard', keywords: ['dashboard', 'home', 'หน้าแรก'], href: '/dashboard', icon: '🏠' },
  { id: 'log', label: 'บันทึกสถิติ', hint: 'Log Workout', keywords: ['log', 'บันทึก', 'workout'], href: '/log', icon: '➕' },
  { id: 'train', label: 'เทรน', hint: 'Train', keywords: ['train', 'เทรน', 'session'], href: '/train', icon: '🏋️' },
  { id: 'session', label: 'เซสชันวันนี้', hint: 'Session', keywords: ['session', 'เซสชัน'], href: '/session', icon: '⏱️' },
  { id: 'program', label: 'โปรแกรม', hint: 'Program', keywords: ['program', 'โปรแกรม'], href: '/program', icon: '📋' },
  { id: 'templates', label: 'เทมเพลต', hint: 'Templates', keywords: ['template', 'เทมเพลต'], href: '/templates', icon: '📄' },
  { id: 'exercises', label: 'ท่าฝึก', hint: 'Exercises', keywords: ['exercise', 'ท่าฝึก', 'exercises'], href: '/exercises', icon: '🏋🏻' },
  { id: 'stats', label: 'สถิติ', hint: 'Stats', keywords: ['stats', 'สถิติ', 'statistics'], href: '/stats', icon: '📈' },
  { id: 'calendar', label: 'ปฏิทิน', hint: 'Calendar', keywords: ['calendar', 'ปฏิทิน'], href: '/calendar', icon: '📅' },
  { id: 'history', label: 'ประวัติ', hint: 'History', keywords: ['history', 'ประวัติ'], href: '/history', icon: '🕘' },
  { id: 'recovery', label: 'การฟื้นตัว', hint: 'Recovery', keywords: ['recovery', 'ฟื้นตัว'], href: '/recovery', icon: '💪' },
  { id: 'cardio', label: 'คาร์ดิโอ', hint: 'Cardio', keywords: ['cardio', 'คาร์ดิโอ', 'running', 'วิ่ง'], href: '/cardio', icon: '🫀' },
  { id: 'health', label: 'วิเคราะห์ร่างกาย', hint: 'Health', keywords: ['health', 'ร่างกาย', 'body'], href: '/health', icon: '🔍' },
  { id: 'coach', label: 'ถาม AI MINT', hint: 'AI Coach', keywords: ['ask', 'coach', 'mint', 'ai', 'ถาม'], href: '/coach', icon: '✨' },
  { id: 'achievements', label: 'ความสำเร็จ', hint: 'Achievements', keywords: ['achievement', 'ความสำเร็จ', 'pr'], href: '/achievements', icon: '🏆' },
  { id: 'timer', label: 'ตัวจับเวลา', hint: 'Timer', keywords: ['timer', 'เวลา'], href: '/timer', icon: '⏲️' },
  { id: 'import', label: 'นำเข้าข้อมูล', hint: 'Import', keywords: ['import', 'นำเข้า'], href: '/import', icon: '📥' },
  { id: 'export', label: 'ส่งออกข้อมูล', hint: 'Export', keywords: ['export', 'ส่งออก'], href: '/export', icon: '📤' },
  { id: 'profile', label: 'โปรไฟล์', hint: 'Profile', keywords: ['profile', 'โปรไฟล์', 'settings', 'ตั้งค่า'], href: '/profile', icon: '👤' },
]

const MUSCLE_COMMANDS: Command[] = (MUSCLE_GROUPS as readonly MuscleGroup[])
  .filter((mg) => mg !== 'ทั้งตัว' && mg !== 'อื่นๆ')
  .map((mg) => ({
    id: `muscle-${mg}`,
    label: `ท่าฝึก${mg}`,
    hint: MUSCLE_GROUP_LABELS_EN[mg],
    keywords: [mg, MUSCLE_GROUP_LABELS_EN[mg].toLowerCase()],
    href: `/exercises?muscle=${encodeURIComponent(mg)}`,
    icon: '💪',
  }))

const ALL_COMMANDS = [...NAV_COMMANDS, ...MUSCLE_COMMANDS]

function matches(command: Command, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return command.keywords.some((k) => k.toLowerCase().includes(q)) || command.label.toLowerCase().includes(q)
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => ALL_COMMANDS.filter((c) => matches(c, query)).slice(0, 8), [query])

  // Cmd+K (Mac) / Ctrl+K (Windows/Linux) เปิดจากทุกหน้า — Esc ปิด — ไม่ดักตอน focus อยู่ใน input/textarea
  // อื่นอยู่แล้ว (เช่นกำลังพิมพ์ฟอร์ม log) ยกเว้นกด Cmd/Ctrl+K ตรงๆ ซึ่งควรเปิดได้เสมอไม่ว่าจะโฟกัสอะไรอยู่
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // รอ modal mount เสร็จก่อนค่อย focus (element ยังไม่มีตอน event loop เดียวกัน)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function go(command: Command) {
    setOpen(false)
    router.push(command.href)
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = results[activeIndex]
      if (chosen) go(chosen)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'rgba(5,6,8,.6)', backdropFilter: 'blur(2px)' }}
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          backgroundImage: [TITANIUM_MESH_CSS, CARD_GRADIENT_CSS].join(', '),
          border: `1px solid ${CARD_BORDER_CSS}`,
          boxShadow: '0 24px 64px -12px rgba(0,0,0,.6)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/8">
          <span className="text-sm" aria-hidden="true">
            ✨
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ไปหน้าไหน หรือค้นหาท่าฝึก..."
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-muted"
            aria-label="ค้นหาคำสั่ง"
          />
          <kbd className="text-[10px] text-muted border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5" role="listbox">
          {results.length === 0 ? (
            <p className="text-xs text-muted text-center py-6">ไม่พบคำสั่งที่ตรงกัน</p>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition"
                style={i === activeIndex ? { backgroundColor: withAlpha(COLORS.amber, '14') } : undefined}
              >
                <span className="text-base shrink-0" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">{c.label}</span>
                </span>
                {c.hint && <span className="text-[10px] text-muted shrink-0">{c.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
