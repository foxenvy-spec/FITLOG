// Shared metric identity + delta semantic colors between BodyMetricsRow.tsx (Desktop Dashboard,
// Health, Stats, Calendar, Session) and components/dashboard/BodyOverviewCard.tsx (Mobile Home) —
// extracted so Weight/Body Fat/Muscle identity colors and the good/bad delta colors have one
// source of truth instead of being duplicated as separate hex literals in each file.
//
// Cross-surface trace (Desktop Dashboard Layer 3 Audit follow-up) found a real mismatch: Weight
// was blue on Mobile vs amber on Desktop, Muscle was teal on Mobile vs blue on Desktop, and the
// two delta-bad values differed too. Mobile's HOME_COLORS-era values (lib/homeColors.ts) are the
// source of truth here — that file's own header comment already named itself the intended
// foundation for future rounds beyond Mobile Home, and this is that round for these 3 metrics.
//
// BMI and Visceral Fat identity colors are explicitly out of scope for this migration (no cross-
// surface conflict was found for them) and stay wherever they already live (BodyMetricsRow.tsx's
// own METRIC_THEME) — do not fold them into this file without a separate trace.
export const METRIC_IDENTITY = {
  weight: { main: '#63b6ff', second: '#2f74e0' },
  bodyFat: { main: '#ff7fb0', second: '#d94f86' },
  muscle: { main: '#57e0cd', second: '#1fae94' },
} as const

// delta-good reuses Mobile's existing value as-is (already the higher-contrast of the two prior
// options: ~9-10:1 against both #101D29 Mobile card and #23272D Desktop surface2).
//
// delta-bad is a genuinely new value, not a straight port of either prior one — checked against
// all 3 criteria the migration boundary required before picking it:
//   1. Contrast: Desktop's old rust (#C1503A) failed WCAG AA on both dark surfaces (~3.2-3.6:1,
//      below the 4.5:1 minimum). #FF6B52 clears AA comfortably (5.3-6.1:1 on the same surfaces).
//   2. Separation from Body Fat's own pink identity color: Mobile's old #ff6b80 sat only
//      ~14-21deg of hue away from Body Fat (#EC4899/#ff7fb0) — a real collision risk (is this
//      card "Body Fat" or "this metric got worse"?). #FF6B52 sits ~38deg away, a clean split.
//   3. Semantic consistency with the existing rust/danger meaning: #FF6B52 is ~1deg of hue from
//      COLORS.rust (lib/theme.ts) — same "danger" hue family, just brighter/more saturated for
//      legibility on a dark surface, not an unrelated red imported from elsewhere.
export const METRIC_DELTA = {
  good: '#3fe092',
  bad: '#FF6B52',
} as const
