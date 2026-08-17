import pb from '@/lib/pocketbase/client'

/**
 * Cancellation policy (Uber-style, asymmetric client vs professional).
 * Publicly readable, admin-writable. Mirrors the `cancellation_policies`
 * single-row collection on the backend.
 */
export interface CancellationPolicy {
  client_grace_hours: number
  client_pct_over_24h: number
  client_pct_4_to_24h: number
  client_pct_under_4h: number
  client_pro_share_pct: number
  pro_grace_hours: number
  pro_fee_over_24h: number
  pro_fee_4_to_24h: number
  pro_fee_under_4h: number
  pro_monthly_limit: number
  updated?: string
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  client_grace_hours: 2,
  client_pct_over_24h: 10,
  client_pct_4_to_24h: 30,
  client_pct_under_4h: 50,
  client_pro_share_pct: 50,
  pro_grace_hours: 1,
  pro_fee_over_24h: 25,
  pro_fee_4_to_24h: 50,
  pro_fee_under_4h: 80,
  pro_monthly_limit: 3,
}

/** Fetch the current cancellation policy (public). Falls back to defaults. */
export async function getCancellationPolicy(): Promise<CancellationPolicy> {
  try {
    const res = await pb.send('/backend/v1/cancellation-policy', { method: 'GET' })
    if (res?.ok && res.policy) {
      return { ...DEFAULT_CANCELLATION_POLICY, ...res.policy } as CancellationPolicy
    }
  } catch (_) {
    // ignore — fall through to defaults
  }
  return DEFAULT_CANCELLATION_POLICY
}

/** Update the cancellation policy (admin only). Sends only the provided fields. */
export async function updateCancellationPolicy(
  patch: Partial<CancellationPolicy>,
): Promise<CancellationPolicy> {
  const res = await pb.send('/backend/v1/cancellation-policy', {
    method: 'PUT',
    body: patch,
  })
  if (!res?.ok) {
    throw new Error(res?.error || 'Falha ao salvar a política de cancelamento.')
  }
  return { ...DEFAULT_CANCELLATION_POLICY, ...(res.policy || {}) } as CancellationPolicy
}

/** Result of cancelling a job server-side. */
export interface CancelJobResult {
  ok: boolean
  job_id: string
  cancelled_by: string
  cancelled_by_role: 'client' | 'pro'
  cancelled_at: string
  penalty_amount: number
  penalty_status: 'pending' | 'charged' | 'waived'
  penalty_label: string
  payment_status?: string
  cancellation_id?: string
  suspended: boolean
  blocked_until?: string
  monthly_cancellations: number
  monthly_limit: number
  reopened?: boolean
  error?: string
}

/** Cancel a job (client or professional). Optional reason. */
export async function cancelJob(jobId: string, reason?: string): Promise<CancelJobResult> {
  const res = await pb.send('/backend/v1/cancel-job', {
    method: 'POST',
    body: { jobId, reason: reason || '' },
  })
  if (!res?.ok) {
    throw new Error(res?.error || 'Não foi possível cancelar o serviço.')
  }
  return res as CancelJobResult
}

/* ------------------------------------------------------------------ */
/* Client-side penalty preview                                        */
/* ------------------------------------------------------------------ */

export interface PenaltyPreview {
  /** True when the cancellation is free (within grace window). */
  free: boolean
  /** Human-readable description of the applied rule. */
  label: string
  /** Penalty amount in BRL (0 when free). */
  amount: number
  /** For clients: the percentage applied. For pros: undefined. */
  percent?: number
}

/**
 * Pure preview of the penalty that *would* be applied for cancelling a job
 * right now. Mirrors the server-side logic in cancel_job.js so the modal can
 * show the exact amount before the user confirms.
 */
export function previewPenalty(
  role: 'client' | 'pro',
  job: {
    accepted_at?: string
    scheduled_at?: string
    price?: number
  },
  policy: CancellationPolicy,
  now: number = Date.now(),
): PenaltyPreview {
  const acceptedMs = job.accepted_at ? new Date(job.accepted_at).getTime() : 0
  const scheduledMs = job.scheduled_at ? new Date(job.scheduled_at).getTime() : 0
  const price = job.price ?? 0

  const hoursSinceAccepted = acceptedMs ? (now - acceptedMs) / 3600000 : Infinity
  const hoursUntilService = scheduledMs ? (scheduledMs - now) / 3600000 : 0

  if (role === 'client') {
    // No professional has accepted yet — cancellation is always free.
    if (!acceptedMs) {
      return {
        free: true,
        label: 'Cancelamento gratuito (serviço ainda não aceito)',
        amount: 0,
        percent: 0,
      }
    }
    const grace = policy.client_grace_hours
    if (grace > 0 && hoursSinceAccepted <= grace) {
      return {
        free: true,
        label: 'Cancelamento gratuito',
        amount: 0,
        percent: 0,
      }
    }
    let pct = 0
    let label = ''
    if (hoursUntilService > 24) {
      pct = policy.client_pct_over_24h
      label = `Será cobrada uma taxa de ${pct}% (R$ ${formatBRL(price * (pct / 100))})`
    } else if (hoursUntilService > 4) {
      pct = policy.client_pct_4_to_24h
      label = `Será cobrada uma taxa de ${pct}% (R$ ${formatBRL(price * (pct / 100))})`
    } else {
      pct = policy.client_pct_under_4h
      label = `Será cobrada uma taxa de ${pct}% (R$ ${formatBRL(price * (pct / 100))})`
    }
    return { free: false, label, amount: round(price * (pct / 100)), percent: pct }
  }

  // professional
  const grace = policy.pro_grace_hours
  if (grace > 0 && hoursSinceAccepted <= grace) {
    return { free: true, label: 'Cancelamento gratuito', amount: 0 }
  }
  let amount = 0
  let label = ''
  if (hoursUntilService > 24) {
    amount = policy.pro_fee_over_24h
    label = `Taxa fixa de R$ ${formatBRL(amount)} (mais de 24h de antecedência)`
  } else if (hoursUntilService > 4) {
    amount = policy.pro_fee_4_to_24h
    label = `Taxa fixa de R$ ${formatBRL(amount)} (entre 4h e 24h de antecedência)`
  } else {
    amount = policy.pro_fee_under_4h
    label = `Taxa fixa de R$ ${formatBRL(amount)} (menos de 4h de antecedência)`
  }
  return { free: amount === 0, label, amount }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function formatBRL(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
