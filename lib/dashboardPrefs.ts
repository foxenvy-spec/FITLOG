export interface DashboardPrefs {
  showRecovery: boolean
  showAICoach: boolean
}

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  showRecovery: true,
  showAICoach: true,
}

const STORAGE_KEY = 'fitlog:dashboardPrefs'

// อ่านค่า preferences จาก localStorage (ปลอดภัยกับ SSR — คืนค่า default ถ้าไม่มี window)
export function loadDashboardPrefs(): DashboardPrefs {
  if (typeof window === 'undefined') return DEFAULT_DASHBOARD_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DASHBOARD_PREFS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_DASHBOARD_PREFS, ...parsed }
  } catch {
    return DEFAULT_DASHBOARD_PREFS
  }
}

export function saveDashboardPrefs(prefs: DashboardPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ปล่อยผ่านเงียบๆ
  }
}
