'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return // pressing Enter fires form submit directly, bypassing the disabled submit button
    setError(null)
    setNotice(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(error.message)
      } else {
        setNotice('สมัครสำเร็จ กรุณาเช็คอีเมลเพื่อยืนยันบัญชี แล้วกลับมาล็อกอิน')
        setMode('signin')
      }
    }

    setLoading(false)
  }

  async function handleForgotPassword() {
    if (loading) return
    setError(null)
    setNotice(null)
    if (!email) {
      setError('กรุณากรอกอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    if (error) {
      setError(error.message)
    } else {
      setNotice('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว')
    }
    setLoading(false)
  }

  return (
    <main className="relative min-h-screen bg-bg overflow-x-hidden safe-top safe-bottom">
      {/* Hero photo — /public/images/login-hero.png (16:9, composed with safe margins so
          background-size: cover never crops into the figures on typical screen ratios).
          Mobile: a height band across just the top of the page, fading into the flat
          bg-bg below so the form/features sit on solid ground. Floor is 220px (not 400px)
          so short-height viewports — landscape phones, ~350-400px tall — don't get a band
          that eats the whole screen and pushes the login form below the fold.
          Desktop/sm+: single `cover` layer — fills the viewport edge-to-edge with no void. */}
      <div
        className="absolute inset-x-0 top-0 h-[clamp(220px,55vh,560px)] sm:hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 40%, rgba(20,22,26,0.55) 0%, rgba(20,22,26,0.35) 30%, rgba(20,22,26,0.1) 55%, rgba(20,22,26,0) 80%), url('/images/login-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      />
      <div
        className="hidden sm:block absolute inset-0 bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 40%, rgba(20,22,26,0.55) 0%, rgba(20,22,26,0.35) 30%, rgba(20,22,26,0.1) 55%, rgba(20,22,26,0) 80%), url('/images/login-hero.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* mobile-only fade from the hero band down into the flat background */}
      <div className="absolute inset-x-0 top-0 h-[clamp(220px,55vh,560px)] sm:hidden bg-gradient-to-b from-transparent via-transparent to-bg" />

      <div className="relative z-10 flex flex-col items-center px-6 pt-10 pb-12 sm:min-h-screen sm:justify-start sm:pt-[clamp(1.5rem,7vh,4.5rem)] sm:pb-[clamp(0.5rem,2vh,1.5rem)]">
        {/* sm+ (desktop): every vertical gap below uses clamp(min, Nvh, max) instead of a fixed
            size, so the whole card+features stack shrinks automatically to fit short viewports
            (common on 14" laptops running 125–150% OS display scaling) without ever needing to
            scroll — while still capping out at the original, more spacious sizes on tall/large
            monitors. Mobile keeps its original fixed sizes (mb-5, mt-2, etc. — no sm: prefix).
            justify-start + pt (instead of justify-center) pins the block nearer the top of the
            viewport instead of dead-center, so the logo sits higher with more breathing room
            below the feature grid. */}
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-5 sm:mb-[clamp(0.5rem,1.4vh,1.25rem)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.png"
              alt="FITLOG"
              className="w-[220px] sm:w-[clamp(120px,18vh,260px)] h-auto select-none"
              draggable={false}
            />
            <p className="mt-1.5 sm:mt-[clamp(0.15rem,0.4vh,0.375rem)] text-[11px] tracked-lg uppercase text-amber">Track &middot; Train &middot; Transform</p>
            <p className="mt-2 sm:mt-[clamp(0.25rem,0.6vh,0.5rem)] text-sm text-ink/90 font-body text-center">
              Track Every Workout. <span className="text-amber">Celebrate Your Progress.</span>
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-bg/70 backdrop-blur-md shadow-hero p-6 sm:p-[clamp(0.75rem,2.2vh,1.5rem)]">
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-[clamp(0.4rem,1vh,0.75rem)]">
              <div className="relative">
                <label htmlFor="login-email" className="sr-only">อีเมล</label>
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-amber">
                  <MailIcon />
                </span>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-11"
                  style={{ paddingLeft: '2.75rem', paddingTop: 'clamp(0.5rem,1.6vh,0.75rem)', paddingBottom: 'clamp(0.5rem,1.6vh,0.75rem)' }}
                  placeholder="อีเมล"
                  autoComplete="email"
                />
              </div>

              <div className="relative">
                <label htmlFor="login-password" className="sr-only">รหัสผ่าน</label>
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-amber">
                  <LockIcon />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-11 pr-11"
                  style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem', paddingTop: 'clamp(0.5rem,1.6vh,0.75rem)', paddingBottom: 'clamp(0.5rem,1.6vh,0.75rem)' }}
                  placeholder="รหัสผ่าน"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-xs">
                <label className="flex items-center gap-2 text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="w-4 h-4 rounded border border-line bg-surface flex items-center justify-center peer-checked:bg-amber peer-checked:border-amber peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber transition">
                    {rememberMe && <CheckIcon />}
                  </span>
                  จดจำฉัน
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-amber hover:underline disabled:opacity-50 disabled:pointer-events-none"
                  >
                    ลืมรหัสผ่าน?
                  </button>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-rusttext bg-rustdim/40 border border-rust/40 rounded-lg px-3 py-2">{error}</p>
              )}
              {notice && (
                <p role="status" aria-live="polite" className="text-sm text-steel bg-steeldim/30 border border-steel/40 rounded-lg px-3 py-2">{notice}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 rounded-lg bg-amber text-bg font-display tracked uppercase py-3 sm:py-[clamp(0.5rem,1.3vh,0.75rem)] text-lg disabled:opacity-50 active:scale-[0.99] transition"
              >
                {loading ? 'กำลังโหลด...' : mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            </form>

            <div className="flex items-center gap-3 mt-5 sm:mt-[clamp(0.5rem,1.2vh,1.25rem)] mb-1">
              <div className="flex-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setNotice(null)
                  setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                }}
                disabled={loading}
                className="text-xs text-muted whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
              >
                {mode === 'signin' ? (
                  <>ยังไม่มีบัญชี? <span className="text-amber font-medium">สมัครสมาชิก</span></>
                ) : (
                  <>มีบัญชีแล้ว? <span className="text-amber font-medium">เข้าสู่ระบบ</span></>
                )}
              </button>
              <div className="flex-1 h-px bg-line" />
            </div>
          </div>

          {/* Desktop / tablet: 3-column feature grid */}
          <div className="hidden sm:grid grid-cols-3 gap-3 sm:gap-[clamp(0.4rem,0.8vh,0.75rem)] mt-6 sm:mt-[clamp(0.5rem,1.5vh,1.5rem)] text-center">
            <Feature icon={<TrendIcon />} title="ติดตามความก้าวหน้า" subtitle="บันทึกทุกการฝึก ทุกความก้าวหน้า" />
            <Feature icon={<TargetIcon />} title="บรรลุเป้าหมาย" subtitle="วางแผนและไปให้ถึงเป้าหมาย" />
            <Feature icon={<MuscleIcon />} title="แข็งแรงขึ้นทุกวัน" subtitle="สร้างวินัยเพื่อผลลัพธ์ที่ดีกว่า" />
          </div>

          {/* Mobile: stacked feature list with icon tiles, matching the reference mockup */}
          <div className="sm:hidden mt-8 divide-y divide-line/60">
            <FeatureRow icon={<TrendIcon />} title="ติดตามความก้าวหน้า" subtitle="บันทึกทุกการฝึก ทุกความก้าวหน้า" first />
            <FeatureRow icon={<TargetIcon />} title="บรรลุเป้าหมาย" subtitle="วางแผนและไปให้ถึงเป้าหมาย" />
            <FeatureRow icon={<MuscleIcon />} title="แข็งแรงขึ้นทุกวัน" subtitle="สร้างวินัยเพื่อผลลัพธ์ที่ดีกว่า" />
          </div>
        </div>
      </div>
    </main>
  )
}

function Feature({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1">
      <span className="text-amber">{icon}</span>
      <p className="text-xs font-display tracked uppercase text-ink">{title}</p>
      <p className="text-[11px] text-muted leading-snug">{subtitle}</p>
    </div>
  )
}

function FeatureRow({
  icon,
  title,
  subtitle,
  first,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  first?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 py-4 ${first ? 'pt-0' : ''}`}>
      <span className="shrink-0 w-14 h-14 rounded-xl border border-line bg-bg/60 flex items-center justify-center text-amber">
        {icon}
      </span>
      <div>
        <p className="text-sm font-display tracked uppercase text-amber">{title}</p>
        <p className="text-xs text-ink/80 leading-snug mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a17.4 17.4 0 0 1-3.19 4.16m-3.29 2.02A9.36 9.36 0 0 1 12 19c-7 0-11-7-11-7a17.5 17.5 0 0 1 4.06-5.19" />
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24" />
      <path d="m1 1 22 22" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#14161A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function TrendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

function MuscleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5c-2 1-3 3-2.5 5.5.5 2.5 2.5 4 5 4h6c2.5 0 4.5-1.5 5-4 .5-2.5-.5-4.5-2.5-5.5" />
      <path d="M9 16v3M15 16v3M6 19h12" />
    </svg>
  )
}
