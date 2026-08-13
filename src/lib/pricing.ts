import { DEFAULT_SETTINGS, type PlatformSettings } from '@/services/settings'

/**
 * Multiplier applied to the per-hour rate based on how long a job is.
 *
 * Short jobs are less attractive to pros (same travel/displacement cost,
 * lower total payout), so the platform applies a surcharge multiplier that
 * decreases as the job gets longer, reaching 1.0 (normal price) at/above the
 * configured `normal_hours_threshold`.
 *
 *   4h–5h  → short_job_multiplier_4_5  (default 1.5×)
 *   6h–7h  → short_job_multiplier_6_7  (default 1.3×)
 *   8h+    → 1.0 (preço normal)
 *
 * Jobs below `min_hours` are clamped to `min_hours` by the caller before this
 * function runs, so we only ever receive values >= min_hours here.
 */
export function getHourMultiplier(
  hours: number,
  settings: Pick<
    PlatformSettings,
    'short_job_multiplier_4_5' | 'short_job_multiplier_6_7' | 'normal_hours_threshold'
  > = DEFAULT_SETTINGS,
): number {
  const h = Math.max(0, Number(hours) || 0)
  const threshold = settings.normal_hours_threshold || DEFAULT_SETTINGS.normal_hours_threshold
  const m45 = settings.short_job_multiplier_4_5 || DEFAULT_SETTINGS.short_job_multiplier_4_5
  const m67 = settings.short_job_multiplier_6_7 || DEFAULT_SETTINGS.short_job_multiplier_6_7

  if (h >= threshold) return 1.0
  if (h >= 6) return m67
  return m45
}

/** Human-readable label for the surcharge band, or null when no surcharge. */
export function shortJobBand(
  hours: number,
  settings: Pick<
    PlatformSettings,
    'short_job_multiplier_4_5' | 'short_job_multiplier_6_7' | 'normal_hours_threshold'
  > = DEFAULT_SETTINGS,
): { multiplier: number; label: string } | null {
  const h = Math.max(0, Number(hours) || 0)
  const threshold = settings.normal_hours_threshold || DEFAULT_SETTINGS.normal_hours_threshold
  if (h >= threshold) return null
  if (h >= 6) return { multiplier: getHourMultiplier(h, settings), label: '6h–7h' }
  return { multiplier: getHourMultiplier(h, settings), label: '4h–5h' }
}

/**
 * Travel/displacement fee for a job.
 *
 * The raw cost is `distanceKm × price per km`, but a configurable minimum
 * fee is applied so short trips still cover the professional's travel. Both
 * values come from the admin-configurable platform settings, falling back to
 * sensible defaults when unset.
 *
 *   fee = max(distanceKm * price_per_km, min_distance_fee)
 */
export function getTravelFee(
  distanceKm: number,
  settings: Pick<PlatformSettings, 'distance_price_per_km' | 'min_distance_fee'> = DEFAULT_SETTINGS,
): number {
  const km = Math.max(0, Number(distanceKm) || 0)
  const perKm = settings.distance_price_per_km || DEFAULT_SETTINGS.distance_price_per_km
  const minFee = settings.min_distance_fee ?? DEFAULT_SETTINGS.min_distance_fee
  const raw = km * perKm
  return Math.max(raw, minFee)
}
