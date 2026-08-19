import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send, MessageCircle, Check, CheckCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import { getJob } from '@/services/api'
import { getAvatarUrl } from '@/lib/avatar'
import {
  isChatAvailable,
  isChatExpired,
  isChatReadOnly,
  getJobMessages,
  sendMessage,
  markJobMessagesAsRead,
} from '@/services/messages'

/** Format an ISO date string to HH:mm in the user's local timezone. */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '--:--'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Human-readable job status label in Portuguese. */
function statusLabel(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Aceito'
    case 'in_progress':
      return 'Em andamento'
    case 'completed':
      return 'Concluído'
    case 'pending':
      return 'Pendente'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status
  }
}

export default function ChatPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  const [job, setJob] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)

  // --- load job + messages -------------------------------------------------
  useEffect(() => {
    if (!jobId || !user?.id) return
    let cancelled = false
    setMessages([])
    setLoading(true)
    ;(async () => {
      try {
        const j = await getJob(jobId)
        if (cancelled) return
        setJob(j)

        const msgs = await getJobMessages(jobId)
        if (cancelled) return
        // Mark received messages as read, then optimistically reflect in state.
        await markJobMessagesAsRead(jobId, user.id)
        setMessages(msgs.map((m: any) => (m.sender !== user.id ? { ...m, read: true } : m)))
      } catch {
        // Messages query may fail if the user is not a participant —
        // the job still loads so we can show the access-denied state.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jobId, user?.id])

  // --- auto-scroll to bottom on new messages -------------------------------
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // --- realtime subscription ----------------------------------------------
  useRealtime(
    'messages',
    (e) => {
      if (e.record.job !== jobId) return
      if (e.action === 'create' || e.action === 'update') {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === e.record.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = e.record
            return next
          }
          return [...prev, e.record].sort(
            (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
          )
        })
        // Auto-mark incoming messages as read (the chat is open).
        if (e.record.sender !== user?.id && !e.record.read) {
          pb.collection('messages')
            .update(e.record.id, { read: true })
            .catch(() => {})
        }
      }
    },
    !!jobId,
  )

  // --- send message --------------------------------------------------------
  const handleSend = async () => {
    const content = draft.trim()
    if (!content || !jobId || !user || sending) return
    if (isChatExpired(job)) {
      toast({
        title: 'Chat encerrado',
        description: 'Este serviço foi concluído há mais de 7 dias. O chat está encerrado.',
        variant: 'destructive',
      })
      return
    }
    setSending(true)
    try {
      const msg = await sendMessage(jobId, user.id, content)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      setDraft('')
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar',
        description: err?.message || 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // --- derived values ------------------------------------------------------
  const isParticipant = job && user && (user.id === job.customer_id || user.id === job.pro_id)
  const otherUser =
    job && user
      ? user.id === job.customer_id
        ? job.expand?.pro_id
        : job.expand?.customer_id
      : null
  const otherName =
    otherUser?.name || (user && job && user.id === job.customer_id ? 'Profissional' : 'Cliente')

  // --- render: loading skeleton -------------------------------------------
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto w-full space-y-4">
        <div className="h-16 bg-muted rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <div className="h-12 w-48 bg-muted rounded-2xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- render: job not found ----------------------------------------------
  if (!job) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-muted-foreground">Serviço não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    )
  }

  // --- render: not a participant ------------------------------------------
  if (!isParticipant) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">O chat não está disponível para este serviço.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    )
  }

  // --- render: chat expired (completed > 7 days) -------------------------
  if (isChatExpired(job)) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">Chat encerrado</p>
        <p className="text-sm text-muted-foreground mt-1">
          Este serviço foi concluído há mais de 7 dias. O chat está totalmente bloqueado.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    )
  }

  // --- render: chat blocked (wrong status) --------------------------------
  if (!isChatAvailable(job)) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">O chat não está disponível para este serviço.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    )
  }

  const readOnly = isChatReadOnly(job)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto w-full border rounded-xl overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-background">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img
          src={getAvatarUrl(otherUser, 128)}
          className="w-10 h-10 rounded-full shrink-0 object-cover"
          alt={otherName}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{otherName}</p>
          <Badge variant="secondary" className="text-xs">
            {statusLabel(job.status)}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3" />
            <p>Nenhuma mensagem ainda. Envie a primeira!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender === user?.id
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <span className="text-[10px] opacity-70">{formatTime(msg.created)}</span>
                    {isOwn &&
                      (msg.read ? (
                        <CheckCheck className="h-3 w-3 text-blue-300" />
                      ) : (
                        <Check className="h-3 w-3 opacity-70" />
                      ))}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-background">
        {readOnly ? (
          <p className="text-center text-sm text-muted-foreground py-3">
            Serviço concluído. O chat está em modo somente leitura.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              rows={1}
              className="resize-none min-h-[40px] max-h-32"
              disabled={sending}
            />
            <Button
              size="icon"
              className="shrink-0"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
