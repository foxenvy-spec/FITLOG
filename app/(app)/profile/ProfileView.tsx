'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { saveAge, saveHeightCm, saveSex } from '@/lib/profile'
import WeightUnitToggle from '@/components/WeightUnitToggle'
import SignOutButton from '@/components/SignOutButton'
import PremiumCard from '@/components/ui/PremiumCard'
import ErrorState from '@/components/ErrorState'
import { COLORS, CARD_GRADIENT_CSS, withAlpha } from '@/lib/theme'

function emailDisplayName(email: string | null | undefined) {
  if (!email) return ''
  return email.split('@')[0]
}

const LINKS = [
  { href: '/health', icon: '📏', label: 'Measures & สุขภาพ', desc: 'น้ำหนัก ส่วนสูง รูปความคืบหน้า' },
  { href: '/calendar', icon: '📆', label: 'ปฏิทิน', desc: 'ดูเวิร์กเอาต์ตามวัน' },
  { href: '/achievements', icon: '🏆', label: 'Achievements', desc: 'สถิติ streak และเป้าหมายที่ทำได้' },
  { href: '/history', icon: '🗂', label: 'ประวัติเวิร์กเอาต์', desc: 'ดูย้อนหลังทั้งหมด' },
  { href: '/export', icon: '⬇️', label: 'ส่งออกข้อมูล', desc: '' },
  { href: '/import', icon: '⬆️', label: 'นำเข้าข้อมูล', desc: '' },
]

export default function ProfileView() {
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setProfileError(null)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!active || !user) return
        setEmail(user.email ?? null)
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!active) return
        if (error) {
          setProfileError(error.message)
          return
        }
        const row = data as (Profile & { display_name: string | null }) | null
        setDisplayName(row?.display_name ?? null)
        setProfile(row)
      } catch (err) {
        if (active) setProfileError(err instanceof Error ? err.message : 'โหลดโปรไฟล์ไม่สำเร็จ')
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [supabase, reloadToken])

  const name = displayName || emailDisplayName(email) || 'นักกีฬา'

  return (
    <div className="space-y-5 pb-4 lg:max-w-2xl lg:mx-auto">
      <div className="flex items-center gap-3">
        {/* วงแหวนอำพัน+พื้นไทเทเนียม เดียวกับภาษาวง avatar ที่ใช้ทั่วแอป (AiRingAvatar/การ์ดผู้ใช้ท้าย
            SidebarNav) แทนวงกลมทึบ bg-surface2 เดิม */}
        <div
          className="shrink-0 rounded-full flex items-center justify-center font-display text-lg tracked uppercase text-amber"
          style={{
            width: 56,
            height: 56,
            backgroundImage: CARD_GRADIENT_CSS,
            border: `1.5px solid ${withAlpha(COLORS.amber, '45')}`,
            boxShadow: `0 0 10px ${withAlpha(COLORS.amber, '20')}`,
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg tracked uppercase text-ink truncate">{name}</p>
          <p className="text-[11px] text-muted font-mono truncate">{email}</p>
        </div>
      </div>

      {profileError ? (
        <ErrorState
          title="โหลดข้อมูลส่วนตัวไม่สำเร็จ"
          message={profileError}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      ) : (
        <PersonalInfoCard profile={profile} onSaved={(p) => setProfile(p)} />
      )}

      <PremiumCard className="divide-y divide-white/5">
        {LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5 transition"
          >
            <span className="shrink-0 text-lg w-6 text-center">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{item.label}</p>
              {item.desc ? <p className="text-[11px] text-muted mt-0.5 truncate">{item.desc}</p> : null}
            </div>
            <span className="text-muted text-xs">→</span>
          </a>
        ))}
      </PremiumCard>

      <div>
        <p className="text-[10px] tracked uppercase text-muted mb-2">ตั้งค่า</p>
        <PremiumCard className="px-4 py-3.5 flex items-center justify-between">
          <p className="text-sm text-ink">หน่วยน้ำหนัก</p>
          <WeightUnitToggle />
        </PremiumCard>
      </div>

      <div className="flex flex-col items-center gap-3 pt-1">
        <SignOutButton />
        <p className="text-[10px] text-muted/60 font-mono text-center">
          FitLog v1.0.0 (Beta)
          <br />
          Designed for Science-Based Training
        </p>
      </div>
    </div>
  )
}

// เพศ+อายุ อยู่หน้าโปรไฟล์ตรงนี้ (ไม่ใช่แค่ในฟอร์มบันทึกวัดผลที่หน้า Health) เพื่อให้ผู้ใช้กรอกได้ตั้งแต่
// เข้าแอปครั้งแรก — สองค่านี้เป็นข้อมูลระดับโปรไฟล์ (ไม่ผูกกับวันที่วัดผลไหนโดยเฉพาะ) ใช้คำนวณเกณฑ์
// มาตรฐานน้ำในร่างกาย/โปรตีน และ BMR/TDEE โดยประมาณ (ดู lib/bmr.ts) ที่หน้า Health
function PersonalInfoCard({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const supabase = createClient()
  const [ageInput, setAgeInput] = useState(profile?.age ? String(profile.age) : '')
  const [heightInput, setHeightInput] = useState(profile?.height_cm ? String(profile.height_cm) : '')
  const [savingSex, setSavingSex] = useState<'male' | 'female' | null>(null)
  const [ageError, setAgeError] = useState<string | null>(null)
  const [heightError, setHeightError] = useState<string | null>(null)

  useEffect(() => {
    setAgeInput(profile?.age ? String(profile.age) : '')
  }, [profile?.age])

  useEffect(() => {
    setHeightInput(profile?.height_cm ? String(profile.height_cm) : '')
  }, [profile?.height_cm])

  async function handlePickSex(sex: 'male' | 'female') {
    if (!profile) return
    setSavingSex(sex)
    try {
      await saveSex(supabase, sex)
      onSaved({ ...profile, sex })
    } catch (err) {
      console.error('บันทึกเพศไม่สำเร็จ', err)
    } finally {
      setSavingSex(null)
    }
  }

  async function handleAgeBlur() {
    if (!profile) return
    const trimmed = ageInput.trim()
    if (!trimmed) return
    const num = Math.round(Number(trimmed))
    if (!Number.isFinite(num) || num === profile.age) return
    setAgeError(null)
    try {
      await saveAge(supabase, num)
      onSaved({ ...profile, age: num })
    } catch (err) {
      console.error('บันทึกอายุไม่สำเร็จ', err)
      setAgeError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    }
  }

  async function handleHeightBlur() {
    if (!profile) return
    const trimmed = heightInput.trim()
    if (!trimmed) return
    const num = Math.round(Number(trimmed))
    if (!Number.isFinite(num) || num === profile.height_cm) return
    setHeightError(null)
    try {
      await saveHeightCm(supabase, num)
      onSaved({ ...profile, height_cm: num })
    } catch (err) {
      console.error('บันทึกส่วนสูงไม่สำเร็จ', err)
      setHeightError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    }
  }

  return (
    <PremiumCard className="px-4 py-3.5 space-y-3">
      <p className="text-[10px] tracked uppercase text-muted">ข้อมูลส่วนตัว</p>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">เพศ</p>
        {/* segmented control สไตล์เดียวกับ WeightUnitToggle — ตัวที่เลือกไว้ทึบสีอำพัน ตัวที่ไม่ได้เลือก
            เป็นแค่ข้อความสีเทาจาง ให้เห็นชัดว่าเลือกอะไรอยู่ (เดิมใช้สี steel/rust คนละโทนสำหรับปุ่ม ชาย/หญิง
            เอง ซึ่งดูคล้ายกันทั้งตอนเลือกและไม่เลือก แยกไม่ออก) */}
        <div
          className="shrink-0 inline-flex rounded-full border border-line bg-surface2 p-0.5"
          role="group"
          aria-label="เพศ"
        >
          <button
            type="button"
            onClick={() => handlePickSex('male')}
            aria-pressed={profile?.sex === 'male'}
            disabled={savingSex !== null || !profile}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display tracked uppercase transition disabled:opacity-50 ${
              profile?.sex === 'male' ? 'bg-amber text-bg' : 'text-muted'
            }`}
          >
            {savingSex === 'male' ? '...' : 'ชาย'}
          </button>
          <button
            type="button"
            onClick={() => handlePickSex('female')}
            aria-pressed={profile?.sex === 'female'}
            disabled={savingSex !== null || !profile}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display tracked uppercase transition disabled:opacity-50 ${
              profile?.sex === 'female' ? 'bg-amber text-bg' : 'text-muted'
            }`}
          >
            {savingSex === 'female' ? '...' : 'หญิง'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="profile-age" className="text-sm text-ink">
          อายุ (ปี)
        </label>
        <input
          id="profile-age"
          type="number"
          inputMode="numeric"
          disabled={!profile}
          value={ageInput}
          onChange={(e) => setAgeInput(e.target.value)}
          onBlur={handleAgeBlur}
          placeholder="เช่น 28"
          className="w-24 shrink-0 bg-surface2 text-ink text-sm text-center font-mono rounded px-2 py-1.5 border border-line outline-none focus:border-amber disabled:opacity-50"
        />
      </div>

      {ageError && <p className="text-[11px] text-rusttext">{ageError}</p>}

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="profile-height" className="text-sm text-ink">
          ส่วนสูง (ซม.)
        </label>
        <input
          id="profile-height"
          type="number"
          inputMode="numeric"
          disabled={!profile}
          value={heightInput}
          onChange={(e) => setHeightInput(e.target.value)}
          onBlur={handleHeightBlur}
          placeholder="เช่น 170"
          className="w-24 shrink-0 bg-surface2 text-ink text-sm text-center font-mono rounded px-2 py-1.5 border border-line outline-none focus:border-amber disabled:opacity-50"
        />
      </div>

      {heightError && <p className="text-[11px] text-rusttext">{heightError}</p>}

      <p className="text-[10px] text-muted/70">
        ใช้คำนวณเกณฑ์มาตรฐานสุขภาพและอัตราการเผาผลาญ (BMR/TDEE) โดยประมาณในหน้า Measures & สุขภาพ
      </p>
    </PremiumCard>
  )
}
