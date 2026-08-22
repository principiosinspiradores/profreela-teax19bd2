import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  RotateCcw,
} from 'lucide-react'
import {
  guaranteeRemainingMs,
  formatGuaranteeCountdown,
  paymentStatusLabel,
  paymentStatusTone,
  type PaymentState,
} from '@/services/checkout'

/**
 * Reusable badge + guarantee countdown for the escrow payment lifecycle.
 *
 * Shows the current payment status (Pagamento garantido, Pré-autorizado,
 * Liberado, Em disputa, Cancelado, Reembolsado) and, when in the guarantee
 * window, a live regressive timer of the days/hours remaining until capture.
 */
export function PaymentStatusBadge({
  state,
  role,
}: {
  state: PaymentState | null | undefined
  role?: string
}) {
  // Re-render every minute so the countdown stays live.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  if (!state || !state.payment_status) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        —
      </Badge>
    )
  }

  const status = state.payment_status
  const remaining = guaranteeRemainingMs(state)

  const icon =
    status === 'authorized'
      ? ShieldCheck
      : status === 'held'
        ? BadgeCheck
        : status === 'released' || status === 'captured'
          ? CheckCircle2
          : status === 'disputed'
            ? AlertTriangle
            : status === 'refunded'
              ? RotateCcw
              : XCircle

  const Icon = icon

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={`${paymentStatusTone(status)} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {paymentStatusLabel(status)}
      </Badge>
      {status === 'held' && remaining > 0 && (
        <span className="text-xs text-amber-700 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatGuaranteeCountdown(remaining)} restantes
        </span>
      )}
      {status === 'held' && remaining <= 0 && (role === undefined || role === 'pro') && (
        <span className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Pronto para captura
        </span>
      )}
      {status === 'disputed' && <span className="text-xs text-red-700">Liberação pausada</span>}
    </div>
  )
}

export default PaymentStatusBadge
