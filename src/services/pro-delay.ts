import pb from '@/lib/pocketbase/client'

/**
 * Client response to the "professional delayed +15 min" flow.
 *
 * The cron `cron_pro_delay.js` arms `delay_notification_sent = true` once the
 * pro is +15 min past `scheduled_start`. This function sends the client's
 * choice to `POST /backend/v1/jobs/:id/pro-delay-response`:
 *
 *   - `extend_1h`   → reschedule +1h (clamped to the 22h closing limit)
 *   - `extend_2h`   → reschedule +2h (clamped to the 22h closing limit)
 *   - `cancel_reopen` → cancel the current job and open an emergency reopen job
 *
 * The endpoint is idempotent: a second call returns the already-applied
 * response without re-applying it.
 */
export type ProDelayResponse = 'extend_1h' | 'extend_2h' | 'cancel_reopen'

export interface ProDelayResult {
  ok: boolean
  error?: string
  already_responded?: boolean
  response?: ProDelayResponse
  job_id?: string
  extended?: boolean
  extension_minutes?: number
  new_scheduled_at?: string
  new_scheduled_end?: string
  cancelled_job_id?: string
  emergency_job_id?: string
}

export async function respondProDelay(
  jobId: string,
  response: ProDelayResponse,
): Promise<ProDelayResult> {
  return await pb.send(`/backend/v1/jobs/${jobId}/pro-delay-response`, {
    method: 'POST',
    body: { response },
  })
}
