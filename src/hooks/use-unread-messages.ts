import { useState, useEffect, useCallback } from 'react'
import { getUnreadCounts, getUnreadJobs } from '@/services/messages'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'

export interface UnreadJobPreview {
  id: string
  unread_count: number
  expand?: any
  [key: string]: any
}

/**
 * Tracks unread chat messages for the authenticated user.
 *
 * Returns a map of `jobId → unreadCount`, a per-job preview list (for the
 * header inbox dropdown) and the total. Refreshes whenever the `messages`
 * collection changes (create/update), so the header badge and per-job badges
 * stay live without a manual refresh.
 *
 * The PocketBase `messages` listRule already restricts results to jobs the
 * user participates in (and whose chat window is still open), so this returns
 * exactly the user's unread inbox.
 */
export function useUnreadMessages() {
  const { user } = useAuth()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [jobs, setJobs] = useState<UnreadJobPreview[]>([])

  const load = useCallback(async () => {
    if (!user) return
    try {
      const c = await getUnreadCounts(user.id)
      setCounts(c)
      const j = await getUnreadJobs(user.id)
      setJobs(j as UnreadJobPreview[])
    } catch {
      /* ignore — badge just stays stale until next realtime event */
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('messages', load)

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  return { counts, total, jobs, refresh: load }
}

export default useUnreadMessages
