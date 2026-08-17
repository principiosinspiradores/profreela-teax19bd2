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
 */
export async function startJob(jobId: string): Promise<any> {
  const res = await pb.send('/backend/v1/start-job', {
    method: 'POST',
    body: { jobId },
  })
  if (!res?.ok) {
    throw new Error(res?.error || 'Não foi possível iniciar o serviço.')
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

/** Cancellation audit rows for a given user (used for the monthly reincidence counter). */
export const getCancellationsByUser = (userId: string) =>
  pb.collection('cancellations').getFullList({
    filter: `cancelled_by="${userId}"`,
    sort: '-cancelled_at',
  })

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
