/**
 * Phone masking and visibility helpers for ProFreela.
 *
 * Rules:
 * 1. NUNCA exibir o telefone real do profissional para o cliente em nenhuma tela
 * 2. No perfil público do profissional (ou onde o cliente visualiza dados do pro),
 *    exibir telefone mascarado: (11) 9****-1234 — apenas os 2 primeiros dígitos do DDD,
 *    um dígito do número e os 4 últimos, o resto com asteriscos.
 * 3. O telefone real só é liberado após o serviço estar concluído (status `completed`)
 *    E o pagamento estar confirmado (payment_status `released` ou `captured`).
 * 4. Mecanismo de liberação manual de emergência: o admin pode liberar o telefone
 *    real de um profissional específico para um cliente específico via painel admin
 *    (`phone_unlocked_for_client === true`).
 */

/**
 * Masks a phone number according to the rule:
 * `(11) 9****-1234` — 2 digits of DDD, first digit of subscriber number, 4 asterisks, and 4 last digits.
 * If the input is shorter, it dynamically masks the inner digits keeping the DDD and the last 4.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')

  if (digits.length === 0) return ''

  // Standard Brazilian mobile (11 digits): e.g. 11987654321 -> (11) 9****-4321
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2)
    const firstDigit = digits.slice(2, 3)
    const last4 = digits.slice(7)
    return `(${ddd}) ${firstDigit}****-${last4}`
  }

  // Standard Brazilian landline (10 digits): e.g. 1133334444 -> (11) 3***-4444 or (11) ****-4444
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2)
    const firstDigit = digits.slice(2, 3)
    const last4 = digits.slice(6)
    return `(${ddd}) ${firstDigit}***-${last4}`
  }

  // Handle numbers with country code (+55, 12 or 13 digits)
  if (digits.length >= 12 && digits.startsWith('55')) {
    const local = digits.slice(2)
    return maskPhone(local)
  }

  // Fallback for any other digit length
  if (digits.length >= 6) {
    const ddd = digits.slice(0, 2)
    const last4 = digits.slice(-4)
    const middleLen = Math.max(1, digits.length - 6)
    const middleStars = '*'.repeat(middleLen)
    return `(${ddd}) ${middleStars}-${last4}`
  }

  // If too short to parse safely, replace all but first and last with asterisks
  return digits.length > 2
    ? `${digits[0]}${'*'.repeat(digits.length - 2)}${digits[digits.length - 1]}`
    : '****'
}

/**
 * Checks whether the client is allowed to see the professional's real phone.
 *
 * Requirements for real phone unlock:
 * - Admin emergency unlock (`phone_unlocked_for_client === true`)
 *   OR
 * - Job is `completed` AND payment_status is `released` or `captured`.
 */
export function canClientViewRealPhone(
  job?: {
    status?: string
    payment_status?: string
    phone_unlocked_for_client?: boolean
  } | null,
): boolean {
  if (!job) return false

  // 1. Admin manual emergency release
  if (job.phone_unlocked_for_client === true) {
    return true
  }

  // 2. Completed service AND payment released/captured
  const isCompleted = job.status === 'completed'
  const isPaymentConfirmed = job.payment_status === 'released' || job.payment_status === 'captured'

  return isCompleted && isPaymentConfirmed
}

/**
 * Returns formatted phone string for client view (masked or real depending on rules).
 */
export function getProPhoneForClient(
  rawPhone: string | null | undefined,
  job?: {
    status?: string
    payment_status?: string
    phone_unlocked_for_client?: boolean
  } | null,
): string {
  if (!rawPhone) return ''
  if (canClientViewRealPhone(job)) {
    return formatPhoneNumber(rawPhone)
  }
  return maskPhone(rawPhone)
}

/**
 * Helper to nicely format a raw 10/11-digit phone number if real display is permitted.
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}
