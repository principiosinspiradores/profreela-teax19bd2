import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/services/notifications'
import { useRealtime } from '@/hooks/use-realtime'
import { useUnreadMessages } from '@/hooks/use-unread-messages'
import { isChatAvailable } from '@/services/messages'
import { getAvatarUrl } from '@/lib/avatar'

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diffMs = Date.now() - t
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function otherParticipantLabel(job: any, currentUserId: string): string {
  const other = job.customer_id === currentUserId ? job.expand?.pro_id : job.expand?.customer_id
  return other?.name || (job.customer_id === currentUserId ? 'Profissional' : 'Cliente')
}

export function NotificationBell() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  // Unread chat messages — live (refreshes on any `messages` collection event).
  const { total: unreadMessages, jobs: unreadJobs, counts } = useUnreadMessages()

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await getNotifications()
      setItems(list)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Live-refresh on any notifications collection change.
  useRealtime('notifications', load)

  const unread = items.filter((n) => !n.read_status)

  const handleClick = async (n: Notification) => {
    setOpen(false)
    if (!n.read_status) {
      await markNotificationRead(n.id)
    }
    if (n.job_id) {
      navigate(role === 'pro' ? `/pro/job/${n.job_id}` : `/client/history`)
    }
  }

  const handleMarkAll = async () => {
    await markAllNotificationsRead()
    load()
  }

  // Open the chat for the first unread job (the badge is a shortcut).
  const handleChatClick = () => {
    setOpen(false)
    const jobId = unreadJobs?.[0]?.id || Object.keys(counts || {})[0]
    if (jobId) {
      navigate(`/chat/${jobId}`)
    } else {
      navigate(role === 'pro' ? '/pro' : '/client')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full"
        aria-label="Mensagens"
        onClick={handleChatClick}
      >
        <MessageCircle className="h-5 w-5" />
        {unreadMessages > 0 && (
          <Badge
            className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background text-[10px] font-semibold"
            aria-label={`${unreadMessages} mensagens não lidas`}
          >
            {unreadMessages > 9 ? '9+' : unreadMessages}
          </Badge>
        )}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unread.length > 0 && (
              <Badge
                className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-accent text-white border-2 border-background text-[10px] font-semibold"
                aria-label={`${unread.length} não lidas`}
              >
                {unread.length > 9 ? '9+' : unread.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 sm:w-96 p-0"
          onOpenAutoFocus={(e) => {
            // prevent focus jump that closes other interactions
            e.preventDefault()
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Notificações</span>
              {unread.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {unread.length} nova{unread.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {unread.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleMarkAll}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
              </Button>
            )}
          </div>

          <ScrollArea className="h-80">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p className="text-sm">Nenhuma notificação por aqui.</p>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors',
                      !n.read_status && 'bg-accent/5',
                    )}
                  >
                    <div className="relative mt-1 shrink-0">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      {!n.read_status && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatRelative(n.created)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default NotificationBell
