import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export const getServices = () => pb.collection('services').getFullList()

/**
 * Create a new service (admin only).
 *
 * The PocketBase JS SDK injects the auth token from `pb.authStore`
 * automatically — we do NOT pass custom headers, because in SDK v0.26.x the
 * second argument of `.create()` is treated as `SendOptions` and custom
 * headers passed there can produce a malformed multipart payload that the
 * server rejects with HTTP 400. Letting the SDK manage the token keeps
 * create and update behaviour identical.
 */
export const createService = async (data: any) => {
  try {
    return await pb.collection('services').create(data)
  } catch (err) {
    console.error('[createService] failed:', err)
    throw err
  }
}

export const updateService = async (id: string, data: any) => {
  try {
    return await pb.collection('services').update(id, data)
  } catch (err) {
    console.error('[updateService] failed:', err)
    throw err
  }
}

export const deleteService = async (id: string) => {
  try {
    return await pb.collection('services').delete(id)
  } catch (err) {
    console.error('[deleteService] failed:', err)
    throw err
  }
}
export const getJobs = () =>
  pb.collection('jobs').getFullList({ expand: 'service_id,pro_id,customer_id', sort: '-created' })
export const loadAllJobs = getJobs
export const getProJobs = (proId: string) =>
  pb.collection('jobs').getFullList({
    filter: `pro_id="${proId}" || status="pending"`,
    expand: 'service_id,customer_id',
    sort: '-created',
  })
export const getClientJobs = (clientId: string) =>
  pb.collection('jobs').getFullList({
    filter: `customer_id="${clientId}"`,
    expand: 'service_id,pro_id',
    sort: '-created',
  })
export const createJob = (data: any) => pb.collection('jobs').create(data)
export const updateJob = (id: string, data: any) => pb.collection('jobs').update(id, data)

/** Fetch a single job by id with its service + customer expanded. */
export const getJob = (id: string) =>
  pb.collection('jobs').getOne(id, { expand: 'service_id,customer_id,pro_id' })

/**
 * Clock-in: transition an accepted job to `in_progress` through the
 * `/backend/v1/start-job` server endpoint. Verifies ownership + status and
 * stamps `started_at` / `clocked_in_at`. Returns the updated job record.
 *
 * The server enforces the 50m geofence (when latitude/longitude are provided)
 * and requires a `start` evidence photo (job_photos) to exist for the job.
 */
export async function startJob(
  jobId: string,
  coords?: { latitude: number; longitude: number },
): Promise<any> {
  const res = await pb.send('/backend/v1/start-job', {
    method: 'POST',
    body: {
      jobId,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    },
  })
  if (!res?.ok) {
    const err = new Error(res?.error || 'Não foi possível iniciar o serviço.')
    ;(err as any).code = res?.code
    throw err
  }
  return res.job
}

/**
 * Clock-out: transition an `in_progress` job to `completed` through the
 * `/backend/v1/finish-job` server endpoint. Verifies ownership + status,
 * enforces the 50m geofence (when coords provided) and requires an `end`
 * evidence photo (job_photos). Starts the 7-day payment guarantee window.
 */
export async function finishJob(
  jobId: string,
  coords?: { latitude: number; longitude: number },
): Promise<any> {
  const res = await pb.send('/backend/v1/finish-job', {
    method: 'POST',
    body: {
      jobId,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    },
  })
  if (!res?.ok) {
    const err = new Error(res?.error || 'Não foi possível finalizar o serviço.')
    ;(err as any).code = res?.code
    throw err
  }
  return res.job
}
export const getBanners = () => pb.collection('banners').getFullList({ filter: 'active=true' })
export const getModerationLogs = () =>
  pb.collection('moderation_logs').getFullList({ expand: 'pro_id' })
export const createModerationLog = (data: any) => pb.collection('moderation_logs').create(data)
export const getUsers = () => pb.collection('users').getFullList({ sort: '-created' })
export const updateUser = (id: string, data: any) => pb.collection('users').update(id, data)
export const getDocuments = () =>
  pb.collection('documents').getFullList({ expand: 'user_id', sort: '-created' })
export const getUserDocuments = (userId: string) =>
  pb.collection('documents').getFullList({ filter: `user_id="${userId}"`, sort: '-created' })
export const createDocument = (data: any) => pb.collection('documents').create(data)
export const updateDocument = (id: string, data: any) => pb.collection('documents').update(id, data)
export const getNearbyPros = async () => {
  const list = await pb.collection('users').getFullList({ filter: `role="pro" && status="active"` })
  // Suspended professionals must not appear in searches/client discovery.
  return list.filter((u: any) => !u.suspended)
}

/**
 * First registered professional (role="pro") — used by the admin moderation
 * card as the target for Advertir/Bloquear actions. Returns null when there
 * is no professional in the base.
 */
export async function getProForModeration(): Promise<any | null> {
  try {
    const list = await pb
      .collection('users')
      .getList(1, 1, { filter: `role="pro"`, sort: 'created' })
    return list?.items?.[0] || null
  } catch {
    return null
  }
}

export interface AntiDisintermediationAlert {
  id: string
  type: 'high_frequency_completed' | 'short_duration_completed' | 'short_interval_recurrent'
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  clientId: string
  clientName: string
  clientPhone?: string
  proId: string
  proName: string
  proPhone?: string
  jobId?: string
  jobIds?: string[]
  totalJobsTogether?: number
  completedJobsTogether?: number
  durationMinutes?: number
  firstJobDate?: string
  lastJobDate?: string
}

export interface ChatDisintermediationAlert {
  id: string
  job: string
  pro_id?: string
  client_id?: string
  detected_content: string
  pattern_matched?: string
  created: string
  updated: string
  expand?: {
    job?: any
    pro_id?: any
    client_id?: any
  }
}

/**
 * Fetch anti-disintermediation alerts (Admin only).
 */
export async function getAntiDisintermediationAlerts(): Promise<{
  ok: boolean
  count: number
  alerts: AntiDisintermediationAlert[]
}> {
  return await pb.send('/backend/v1/admin/anti-disintermediation-alerts', {
    method: 'GET',
  })
}

/**
 * Fetch chat disintermediation alerts from the `disintermediation_alerts` collection (Admin only).
 */
export async function getChatDisintermediationAlerts(): Promise<ChatDisintermediationAlert[]> {
  return await pb.collection('disintermediation_alerts').getFullList<ChatDisintermediationAlert>({
    expand: 'job,job.service_id,pro_id,client_id',
    sort: '-created',
  })
}

/**
 * Admin emergency manual release of pro's phone for a specific job/client.
 */
export async function adminUnlockPhone(
  jobId: string,
  unlocked = true,
): Promise<{ ok: boolean; jobId: string; unlocked: boolean; message: string }> {
  return await pb.send('/backend/v1/admin/unlock-phone', {
    method: 'POST',
    body: { jobId, unlocked },
  })
}

/** Cancellation audit rows for a given user (used for the monthly reincidence counter). */
export const getCancellationsByUser = (userId: string) =>
  pb.collection('cancellations').getFullList({
    filter: `cancelled_by="${userId}"`,
    sort: '-cancelled_at',
  })

/* ------------------------------------------------------------------ */
/* Delay-driven penalty (Entrega 2)                                    */
/* ------------------------------------------------------------------ */

/** Jobs that generated a penalty debit against a professional (delay-driven cancel+reopen). */
export const getProPenaltyJobs = (proId: string) =>
  pb.collection('jobs').getFullList({
    filter: `pro_id="${proId}" && penalty_applied=true`,
    expand: 'service_id,customer_id',
    sort: '-created',
  })

/** All professionals with an outstanding penalty balance (admin). */
export const getProsWithPenalty = () =>
  pb.collection('users').getFullList({
    filter: `role="pro" && penalty_balance > 0`,
    sort: '-penalty_balance',
  })

/** All penalty-generating jobs across the platform (admin, for the Penalties panel). */
export const getPenaltyJobs = () =>
  pb.collection('jobs').getFullList({
    filter: `penalty_applied=true`,
    expand: 'service_id,pro_id,customer_id',
    sort: '-created',
  })

/** Admin: forgive (zero out) a professional's outstanding penalty balance. */
export async function forgivePenalty(proId: string): Promise<{
  ok: boolean
  pro_id: string
  forgiven_amount: number
  jobs_marked: number
  error?: string
}> {
  return await pb.send('/backend/v1/admin/forgive-penalty', {
    method: 'POST',
    body: { proId },
  })
}

/**
 * Fetch the Google Maps API key for client-side use (Places Autocomplete).
 * The key is exposed through an authenticated pb_hook endpoint and should be
 * restricted by API + HTTP referrer in the Google Cloud console.
 */
export async function getMapsApiKey(): Promise<string | null> {
  try {
    const res = await pb.send('/backend/v1/maps/api-key', { method: 'GET' })
    if (res && res.ok && res.key) return res.key as string
    return null
  } catch (_) {
    return null
  }
}
