import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Clock, Ban, RotateCw, AlertTriangle } from 'lucide-react'
import { respondProDelay, type ProDelayResponse, type ProDelayResult } from '@/services/pro-delay'

/**
 * Dialog that asks the client how to proceed when the professional is +15 min
 * late for a scheduled job.
 *
 * The cron `cron_pro_delay.js` arms `delay_notification_sent = true` on the
 * job; this component appears for any of the client's `accepted` jobs that
 * carry that flag and still have no `client_delay_response`. The three
 * options map 1:1 to the spec:
 *
 *   - "Estender 1h"       → respondProDelay(job, 'extend_1h')
 *   - "Estender 2h"       → respondProDelay(job, 'extend_2h')
 *   - "Cancelar e reabrir" → respondProDelay(job, 'cancel_reopen')
 *
 * The 10-min client timeout is enforced server-side by the cron (it cancels +
 * reopens automatically when `client_delay_response` is still null 10 min
 * after `delay_notified_at`). Here we only surface a live countdown derived
 * from `delay_notified_at` so the client knows the deadline is real.
 */

interface ProDelayDialogProps {
  /** Jobs owned by the client that need a delay response (any number — handled sequentially). */
  jobs: any[]
  /** Called after a response is applied so the caller can refresh its data. */
  onResolved: (result: ProDelayResult) => void
}

function pad2(n: number) {
  return n < 10 ? '0' + n : String(n)
}

export function ProDelayDialog({ jobs, onResolved }: ProDelayDialogProps) {
  // The job currently being answered (first pending one). Switching happens
  // automatically after a response resolves.
  const job = useMemo(() => jobs[0] ?? null, [jobs])
  const [submitting, setSubmitting] = useState<ProDelayResponse | null>(null)

  // Close the dialog whenever there is no pending job left.
  const open = !!job

  // Live countdown to the 10-min timeout, derived from delay_notified_at.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [open])

  const remainingSeconds = useMemo(() => {
    if (!job?.delay_notified_at) return 0
    const notifiedMs = new Date(job.delay_notified_at).getTime()
    if (isNaN(notifiedMs)) return 0
    const elapsedSec = Math.max(0, Math.floor((Date.now() - notifiedMs) / 1000))
    return Math.max(0, 600 - elapsedSec)
  }, [job, submitting])

  const mm = pad2(Math.floor(remainingSeconds / 60))
  const ss = pad2(remainingSeconds % 60)

  const handleRespond = async (response: ProDelayResponse) => {
    if (!job || submitting) return
    setSubmitting(response)
    try {
      const result = await respondProDelay(job.id, response)
      onResolved(result)
    } finally {
      setSubmitting(null)
    }
  }

  if (!job) return null
  const proName = job.expand?.pro_id?.name || 'o profissional'

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // The client must answer; the cron will auto-cancel + reopen after 10 min.
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />O profissional atrasou
          </DialogTitle>
          <DialogDescription>
            O profissional <strong>{proName}</strong> atrasou para o serviço{' '}
            <strong>{job.expand?.service_id?.name || ''}</strong>. Deseja estender o prazo ou
            cancelar e reabrir?
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <Clock className="h-4 w-4" />
          {remainingSeconds > 0 ? (
            <span>
              Resposta automática em{' '}
              <strong>
                {mm}:{ss}
              </strong>{' '}
              (cancelamento + reabertura emergencial).
            </span>
          ) : (
            <span>
              Tempo esgotado — o cancelamento e reabertura serão processados a qualquer momento.
            </span>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
          <Button
            className="w-full"
            variant="outline"
            disabled={!!submitting}
            onClick={() => handleRespond('extend_1h')}
          >
            {submitting === 'extend_1h' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Clock className="h-4 w-4 mr-2" />
            )}
            Estender 1h
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={!!submitting}
            onClick={() => handleRespond('extend_2h')}
          >
            {submitting === 'extend_2h' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Clock className="h-4 w-4 mr-2" />
            )}
            Estender 2h
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            disabled={!!submitting}
            onClick={() => handleRespond('cancel_reopen')}
          >
            {submitting === 'cancel_reopen' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4 mr-2" />
            )}
            Cancelar e reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Re-export the icon used by the header so the parent can render a tiny
// in-card banner too without re-importing from lucide-react.
export { Ban as ProDelayCancelIcon }
