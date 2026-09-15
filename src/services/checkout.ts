import pb from '@/lib/pocketbase/client'
import { getSettings, type PlatformSettings } from './settings'

export interface PaymentConfig {
  provider: 'stripe' | 'mercadopago' | null
  publicKey: string
}

export interface PaymentSplit {
  total: number
  currency: string
  platformFee: number
  proAmount: number
  feePercent: number
  minFee: number
}

/** Lifecycle status of an escrow payment stored on a job record. */
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'held'
  | 'released'
  | 'captured'
  | 'disputed'
  | 'cancelled'
  | 'refunded'
  | ''

/** Job record augmented with the escrow fields (subset). */
export interface PaymentState {
  payment_status: PaymentStatus
  payment_intent_id?: string
  payment_authorized_at?: string
  payment_hold_until?: string
  payment_released_at?: string
  payment_disputed_at?: string
  dispute_reason?: string
}

/**
 * Payment gateway integration (Stripe / Mercado Pago) with the "pay at request"
 * (escrow) flow. The customer pays BEFORE the job is created, the amount is
 * captured + held in escrow by the platform (payment_status = 'held'). When
 * the professional completes the job, a 24h guarantee window starts; after it
 * elapses without a dispute, the held payment is released to the pro. Disputes
 * pause the window; if the job is cancelled before release, the held amount
 * is refunded to the client (payment_status = 'refunded').
 */

/** Get the configured gateway + its public key (or null if none configured). */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await pb.send('/backend/v1/payments/config', { method: 'GET' })
    if (res?.ok && res.config) {
      return {
        provider: res.config.provider as PaymentConfig['provider'],
        publicKey: res.config.publicKey || '',
      }
    }
  } catch {
    /* intentionally ignored */
  }
  return { provider: null, publicKey: '' }
}

/**
 * Compute the payment split for a given amount using the platform settings.
 * Pure client-side helper for previews (the authoritative split is created
 * server-side in pb_hooks).
 */
export function computeSplit(
  amount: number,
  settings: PlatformSettings,
  currency = 'brl',
): PaymentSplit {
  const feePercent = settings.service_fee_percent ?? 15
  const minFee = settings.min_service_fee ?? 5
  let platformFee = (amount * feePercent) / 100
  if (platformFee < minFee) platformFee = minFee
  const proAmount = Math.max(0, amount - platformFee)
  return {
    total: amount,
    currency,
    platformFee,
    proAmount,
    feePercent,
    minFee,
  }
}

/**
 * Create a pre-authorization (manual capture) on the customer's card.
 * The amount is held — NOT captured — until captureSplitPayment is called
 * after the guarantee window.
 */
export async function createSplitPayment(params: {
  amount: number
  currency?: string
  proAccountId: string
  description?: string
  jobId?: string
  paymentToken?: string
  paymentMethodId?: string
  payerEmail?: string
  installments?: number
}): Promise<any> {
  const res = await pb.send('/backend/v1/payments/create-split', {
    method: 'POST',
    body: {
      amount: params.amount,
      currency: params.currency || 'brl',
      proAccountId: params.proAccountId,
      description: params.description || 'Serviço ProFreela',
      jobId: params.jobId || '',
      paymentToken: params.paymentToken,
      paymentMethodId: params.paymentMethodId,
      payerEmail: params.payerEmail,
      installments: params.installments,
    },
  })
  return res
}

/**
 * Start the 7-day guarantee window (called on service completion).
 * Sets the job's payment_status to "held" and stores payment_hold_until.
 */
export async function releasePayment(jobId: string): Promise<any> {
  return pb.send('/backend/v1/payments/release-payment', {
    method: 'POST',
    body: { jobId },
  })
}

/**
 * Capture the pre-authorization and apply the platform-fee split.
 * Only callable after the guarantee window has elapsed (or with admin force).
 */
export async function captureSplitPayment(jobId: string, force = false): Promise<any> {
  return pb.send('/backend/v1/payments/capture-split', {
    method: 'POST',
    body: { jobId, force },
  })
}

/** Open a dispute — pauses the guarantee window. */
export async function disputePayment(jobId: string, reason: string): Promise<any> {
  return pb.send('/backend/v1/payments/dispute-payment', {
    method: 'POST',
    body: { jobId, reason },
  })
}

/** Cancel the pre-authorization (auto-refund). Used on missed clock-in. */
export async function cancelAuthorization(jobId: string): Promise<any> {
  return pb.send('/backend/v1/payments/cancel-auth', {
    method: 'POST',
    body: { jobId },
  })
}

/**
 * Full checkout preview: combines settings + computed split, useful for
 * rendering the checkout UI before confirming the payment.
 */
export async function getCheckoutPreview(amount: number, currency = 'brl') {
  const [settings, config] = await Promise.all([getSettings(), getPaymentConfig()])
  const split = computeSplit(amount, settings, currency)
  return { settings, config, split }
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  authorized: 'Pré-autorizado',
  held: 'Em garantia',
  released: 'Liberado',
  captured: 'Capturado',
  disputed: 'Em disputa',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  authorized: 'bg-blue-100 text-blue-800 border-blue-200',
  held: 'bg-amber-100 text-amber-800 border-amber-200',
  released: 'bg-green-100 text-green-800 border-green-200',
  captured: 'bg-green-100 text-green-800 border-green-200',
  disputed: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-slate-200 text-slate-700 border-slate-300',
  refunded: 'bg-purple-100 text-purple-800 border-purple-200',
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status ? STATUS_LABELS[status] : '—'
}

export function paymentStatusTone(status: PaymentStatus): string {
  return status ? STATUS_TONES[status] : 'bg-muted text-muted-foreground border-border'
}

/** Milliseconds remaining in the guarantee window. Negative when elapsed. */
export function guaranteeRemainingMs(state: PaymentState): number {
  if (!state?.payment_hold_until) return 0
  if (state.payment_status === 'disputed') return 0 // frozen
  const ts = new Date(state.payment_hold_until).getTime()
  if (isNaN(ts)) return 0
  return ts - Date.now()
}

/** Human-readable "Xd Yh Zm" countdown for the guarantee window. */
export function formatGuaranteeCountdown(ms: number): string {
  if (ms <= 0) return '0 dias'
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const minutes = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}min`
}
