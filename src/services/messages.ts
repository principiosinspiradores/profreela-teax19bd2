import pb from '@/lib/pocketbase/client'

/** 7 days in milliseconds — the post-completion chat window. */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Reference timestamp used to decide whether the chat window is still open
 * for a completed job. The backend createRule/listRule measure from
 * `completed_at`; we mirror that here so the UI and the backend agree.
 */
function completedAtMs(job: any): number {
  if (!job) return 0
  // Prefer completed_at; fall back to updated for jobs completed before the
  // completed_at column existed.
  const src = job.completed_at || job.updated
  return src ? new Date(src).getTime() : 0
}

/**
 * Check whether the chat is accessible for the given job.
 * Allowed when the job is accepted, in_progress, or completed within the last
 * 7 days (measured from `completed_at`, mirroring the backend listRule).
 */
export function isChatAvailable(job: any): boolean {
  if (!job) return false
  const status = job.status
  if (status === 'accepted' || status === 'in_progress') return true
  if (status === 'completed') {
    const at = completedAtMs(job)
    if (!at) return false
    return Date.now() - at < SEVEN_DAYS_MS
  }
  return false
}

/**
 * Check whether the chat is expired — completed more than 7 days ago.
 * After expiry the chat is fully blocked (even read is denied by the backend).
 */
export function isChatExpired(job: any): boolean {
  if (!job || job.status !== 'completed') return false
  const at = completedAtMs(job)
  if (!at) return false
  return Date.now() - at >= SEVEN_DAYS_MS
}

/**
 * Whether the chat is in read-only mode: the job is completed but still within
 * the 7-day window. New messages are rejected by the backend createRule; the UI
 * shows the history but disables the input.
 */
export function isChatReadOnly(job: any): boolean {
  if (!job || job.status !== 'completed') return false
  return !isChatExpired(job)
}

/** Fetch all messages for a job, sorted oldest-first. */
export async function getJobMessages(jobId: string): Promise<any[]> {
  return await pb.collection('messages').getFullList({
    filter: `job="${jobId}"`,
    sort: 'created',
  })
}

/** Send a new message. The backend createRule validates job status + access. */
export async function sendMessage(jobId: string, senderId: string, content: string): Promise<any> {
  return await pb.collection('messages').create({
    job: jobId,
    sender: senderId,
    content,
    read: false,
  })
}

/**
 * Mark all unread received messages in a job as read.
 * Returns the IDs that were updated so the caller can optimistically patch
 * local state without an extra fetch.
 */
export async function markJobMessagesAsRead(jobId: string, userId: string): Promise<string[]> {
  const unread = await pb.collection('messages').getFullList({
    filter: `job="${jobId}" && sender != "${userId}" && read = false`,
  })
  const ids = unread.map((m: any) => m.id)
  await Promise.all(
    unread.map((m: any) =>
      pb
        .collection('messages')
        .update(m.id, { read: true })
        .catch(() => {}),
    ),
  )
  return ids
}

/**
 * Get unread message counts grouped by job ID for the current user.
 * The PocketBase listRule already restricts results to jobs the user
 * participates in, so this returns exactly the user's unread inbox.
 */
export async function getUnreadCounts(userId: string): Promise<Record<string, number>> {
  const unread = await pb
    .collection('messages')
    .getFullList({ filter: `sender != "${userId}" && read = false` })
  const map: Record<string, number> = {}
  unread.forEach((m: any) => {
    const jid = m.job
    if (jid) map[jid] = (map[jid] || 0) + 1
  })
  return map
}

/** Get the total unread count across all jobs for the current user. */
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const result = await pb
    .collection('messages')
    .getList(1, 1, { filter: `sender != "${userId}" && read = false` })
  return result.totalItems
}

/**
 * Fetch the job records that currently have unread messages for the user.
 * Returns up to `limit` jobs (default 8) expanded with service_id + both
 * participants, so the header inbox can render a clickable preview list.
 * Only jobs the user participates in (and whose chat window is still open)
 * are returned — the messages listRule already enforces that.
 */
export async function getUnreadJobs(userId: string, limit = 8): Promise<any[]> {
  const counts = await getUnreadCounts(userId)
  const jobIds = Object.keys(counts).slice(0, limit)
  if (jobIds.length === 0) return []
  const jobs = await Promise.all(
    jobIds.map((id) =>
      pb
        .collection('jobs')
        .getOne(id, { expand: 'service_id,customer_id,pro_id' })
        .catch(() => null),
    ),
  )
  return jobs.filter(Boolean).map((job: any) => ({
    ...job,
    unread_count: counts[job.id] || 0,
  }))
}

/** Get the unread count for a specific job. */
export async function getJobUnreadCount(jobId: string, userId: string): Promise<number> {
  const unread = await pb
    .collection('messages')
    .getFullList({ filter: `job="${jobId}" && sender != "${userId}" && read = false` })
  return unread.length
}
