import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  read_status: boolean
  job_id: string | null
  created: string
  updated: string
  expand?: {
    job_id?: any
  }
}

/** Fetch the current user's notifications, newest first. */
export const getNotifications = () =>
  pb.collection('notifications').getFullList({
    sort: '-created',
    expand: 'job_id',
  }) as Promise<Notification[]>

/** Count of unread notifications for the current user. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  const result = await pb.collection('notifications').getList(1, 1, {
    filter: 'read_status = false',
  })
  return result.totalItems
}

/** Mark a single notification as read. */
export const markNotificationRead = async (id: string): Promise<void> => {
  try {
    await pb.collection('notifications').update(id, { read_status: true })
  } catch (err) {
    console.error('[markNotificationRead] failed:', getErrorMessage(err))
  }
}

/** Mark all unread notifications as read. */
export const markAllNotificationsRead = async (): Promise<void> => {
  try {
    const unread = await pb.collection('notifications').getFullList({
      filter: 'read_status = false',
    })
    await Promise.all(
      unread.map((n: any) => pb.collection('notifications').update(n.id, { read_status: true })),
    )
  } catch (err) {
    console.error('[markAllNotificationsRead] failed:', getErrorMessage(err))
  }
}
