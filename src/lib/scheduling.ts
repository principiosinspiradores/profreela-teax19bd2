/**
 * Scheduling helpers for building and formatting job `scheduled_at` datetimes.
 *
 * ProFreela operates in Brazil (UTC-03:00, no DST since 2019), so the time
 * offset sent to the backend is always `-03:00`. Storing the full offset
 * (rather than a bare midnight UTC) keeps the conflict-overlap check in
 * `accept_job.js` correct and lets pros/clients see the real start time.
 */

const TIMEZONE_OFFSET = '-03:00'

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/**
 * Combine a calendar date (local, no time component) and a `HH:MM` string
 * into a full ISO datetime with the -03:00 offset.
 *
 *   combineDateAndTime(new Date('2025-07-30'), '08:00')
 *   // => '2025-07-30T08:00:00-03:00'
 */
export function combineDateAndTime(date: Date, time: string): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  const clean = (time || '').trim()
  // Accept "HH:MM" (already 5 chars); clamp hour 0-23, minute 0-59.
  const [hh, mm] = clean.split(':')
  const h = pad2(Math.max(0, Math.min(23, parseInt(hh, 10) || 0)))
  const min = pad2(Math.max(0, Math.min(59, parseInt(mm, 10) || 0)))
  return `${y}-${m}-${d}T${h}:${min}:00${TIMEZONE_OFFSET}`
}

/**
 * Add `hours` to an ISO datetime string and return the resulting Date.
 */
export function endTime(scheduledAt: string, hours: number): Date {
  const start = new Date(scheduledAt).getTime()
  return new Date(start + (Number(hours) || 0) * 3600000)
}

/**
 * Format the time portion of a Date as `HH:MM` (24h, -03:00 offset-aware).
 *
 * Because scheduled_at carries an explicit `-03:00` offset, we read the local
 * hours/minutes through the parts of the offset-adjusted time rather than the
 * raw UTC getUTCHours (which would shift the value by 3 hours).
 */
export function formatTime(date: Date): string {
  // When the datetime was built with combineDateAndTime it already encodes the
  // -03:00 offset; new Date() parses it to the correct UTC instant, so reading
  // via getUTCHours/Minutes would be 3h off. Instead, shift back by the offset
  // to recover the wall-clock time the user picked.
  const adjusted = new Date(date.getTime() - 3 * 3600000)
  return pad2(adjusted.getUTCHours()) + ':' + pad2(adjusted.getUTCMinutes())
}

/**
 * Format a scheduled job's date and time window like:
 *   "30/07 • 08:00–16:00 (8h)"
 *
 * Falls back to a date-only / "início imediato" label when data is missing.
 */
export function formatScheduledSlot(scheduledAt?: string, hours?: number): string {
  if (!scheduledAt) return 'Horário a definir'
  const d = new Date(scheduledAt)
  if (isNaN(d.getTime())) return 'Horário a definir'
  const adjusted = new Date(d.getTime() - 3 * 3600000)
  const datePart = `${pad2(adjusted.getUTCDate())}/${pad2(adjusted.getUTCMonth() + 1)}`
  const start = formatTime(d)
  const h = Number(hours) || 0
  if (h > 0) {
    const end = formatTime(endTime(scheduledAt, h))
    return `${datePart} • ${start}–${end} (${h}h)`
  }
  return `${datePart} • ${start}`
}

/**
 * Human-readable time range for the client summary:
 *   "Das 08:00 às 16:00"
 */
export function formatTimeRange(scheduledAt: string, hours: number): string {
  const start = formatTime(new Date(scheduledAt))
  const end = formatTime(endTime(scheduledAt, hours))
  return `Das ${start} às ${end}`
}
