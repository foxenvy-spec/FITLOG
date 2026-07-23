export type HeatmapMetric = 'volume' | 'duration' | 'calories' | 'sets'

export const HEATMAP_METRIC_LABEL: Record<HeatmapMetric, string> = {
  volume: 'Volume',
  duration: 'Duration',
  calories: 'Calories',
  sets: 'Sets',
}

const DEFAULT_METRIC: HeatmapMetric = 'volume'
const STORAGE_KEY = 'fitlog:heatmapMetric'

// อ่านค่า metric ที่เลือกไว้ล่าสุดจาก localStorage (ปลอดภัยกับ SSR — คืนค่า default ถ้าไม่มี window)
export function loadHeatmapMetric(): HeatmapMetric {
  if (typeof window === 'undefined') return DEFAULT_METRIC
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'volume' || raw === 'duration' || raw === 'calories' || raw === 'sets') return raw
    return DEFAULT_METRIC
  } catch {
    return DEFAULT_METRIC
  }
}

export function saveHeatmapMetric(metric: HeatmapMetric) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, metric)
  } catch {
    // localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ปล่อยผ่านเงียบๆ
  }
}
