import pb from '@/lib/pocketbase/client'

export type ProPaymentAccountStatus = 'pending' | 'verified' | 'rejected'
export type DocType = 'cpf' | 'cnpj'
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | 'none'
export type PayoutStatus = 'pending' | 'paid' | 'failed'

export interface ProPaymentAccount {
  id: string
  user_id: string
  holder_name: string
  doc_type: DocType
  doc_number: string
  pix_key_type?: PixKeyType
  pix_key?: string
  bank_name?: string
  bank_agency?: string
  bank_account?: string
  status: ProPaymentAccountStatus
  reviewed_at?: string
  reviewed_by?: string
  reviewer_note?: string
  created: string
  updated: string
  expand?: {
    user_id?: {
      id: string
      name: string
      email: string
      phone?: string
      avatar?: string
    }
    reviewed_by?: {
      id: string
      name: string
      email: string
    }
  }
}

export interface PayoutRecord {
  id: string
  pro_id: string
  job_id: string
  amount_gross: number
  platform_fee: number
  penalty_debit: number
  amount_net: number
  status: PayoutStatus
  method: string
  external_id?: string
  paid_at?: string
  notes?: string
  created: string
  updated: string
  expand?: {
    pro_id?: {
      id: string
      name: string
      email: string
      phone?: string
    }
    job_id?: {
      id: string
      address: string
      price: number
      client_price?: number
      created: string
      scheduled_at?: string
      completed_at?: string
      status: string
      payment_status: string
      service_id?: string
      expand?: {
        service_id?: {
          id: string
          name: string
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Validation helpers for CPF / CNPJ and Pix keys                     */
/* ------------------------------------------------------------------ */

export function cleanDigits(val: string): string {
  return (val || '').replace(/\D/g, '')
}

export function validateCPF(cpf: string): boolean {
  const digits = cleanDigits(cpf)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i)
  }
  let rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(digits.charAt(9), 10)) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i)
  }
  rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(digits.charAt(10), 10)) return false

  return true
}

export function validateCNPJ(cnpj: string): boolean {
  const digits = cleanDigits(cnpj)
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const b = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits.charAt(i), 10) * b[i + 1]
  }
  let rev = sum % 11
  const d1 = rev < 2 ? 0 : 11 - rev
  if (parseInt(digits.charAt(12), 10) !== d1) return false

  sum = 0
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits.charAt(i), 10) * b[i]
  }
  rev = sum % 11
  const d2 = rev < 2 ? 0 : 11 - rev
  if (parseInt(digits.charAt(13), 10) !== d2) return false

  return true
}

export function formatCPF(val: string): string {
  const d = cleanDigits(val).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

export function formatCNPJ(val: string): string {
  const d = cleanDigits(val).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

export function formatPixKey(type: PixKeyType, value: string): string {
  if (!value) return ''
  if (type === 'cpf') return formatCPF(value)
  if (type === 'cnpj') return formatCNPJ(value)
  if (type === 'phone') {
    const d = cleanDigits(value).slice(0, 11)
    if (d.length <= 2) return d.length ? `(${d}` : ''
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return value.trim()
}

export function validatePixKey(
  type: PixKeyType,
  value: string,
): { valid: boolean; error?: string } {
  if (type === 'none') return { valid: true }
  const trimmed = value.trim()
  if (!trimmed) return { valid: false, error: 'A chave Pix é obrigatória.' }

  if (type === 'cpf') {
    return validateCPF(trimmed) ? { valid: true } : { valid: false, error: 'CPF inválido.' }
  }
  if (type === 'cnpj') {
    return validateCNPJ(trimmed) ? { valid: true } : { valid: false, error: 'CNPJ inválido.' }
  }
  if (type === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(trimmed) ? { valid: true } : { valid: false, error: 'E-mail inválido.' }
  }
  if (type === 'phone') {
    const d = cleanDigits(trimmed)
    return d.length === 10 || d.length === 11
      ? { valid: true }
      : { valid: false, error: 'Telefone com DDD deve ter 10 ou 11 dígitos.' }
  }
  if (type === 'random') {
    return trimmed.length >= 20
      ? { valid: true }
      : { valid: false, error: 'Chave aleatória inválida (mínimo 20 caracteres).' }
  }
  return { valid: true }
}

/* ------------------------------------------------------------------ */
/* Pro Payment Accounts API                                           */
/* ------------------------------------------------------------------ */

export async function getProPaymentAccount(userId: string): Promise<ProPaymentAccount | null> {
  try {
    const records = await pb.collection('pro_payment_accounts').getFullList<ProPaymentAccount>({
      filter: `user_id="${userId}"`,
      expand: 'user_id,reviewed_by',
    })
    return records.length > 0 ? records[0] : null
  } catch (err) {
    return null
  }
}

export async function upsertProPaymentAccount(
  userId: string,
  data: Partial<Omit<ProPaymentAccount, 'id' | 'user_id' | 'created' | 'updated'>>,
): Promise<ProPaymentAccount> {
  const existing = await getProPaymentAccount(userId)
  const payload = {
    ...data,
    user_id: userId,
    // When a pro submits or edits, it reverts to pending for review
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
    reviewer_note: '',
  }

  if (existing) {
    return pb.collection('pro_payment_accounts').update<ProPaymentAccount>(existing.id, payload)
  }
  return pb.collection('pro_payment_accounts').create<ProPaymentAccount>(payload)
}

export async function getAllProPaymentAccounts(
  filterStatus?: string,
): Promise<ProPaymentAccount[]> {
  const filter = filterStatus && filterStatus !== 'all' ? `status="${filterStatus}"` : ''
  return pb.collection('pro_payment_accounts').getFullList<ProPaymentAccount>({
    filter,
    sort: '-updated',
    expand: 'user_id,reviewed_by',
  })
}

export async function reviewProPaymentAccount(
  accountId: string,
  status: 'verified' | 'rejected',
  adminId: string,
  reviewerNote?: string,
): Promise<ProPaymentAccount> {
  return pb.collection('pro_payment_accounts').update<ProPaymentAccount>(accountId, {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminId,
    reviewer_note: reviewerNote || '',
  })
}

/* ------------------------------------------------------------------ */
/* Payouts API                                                        */
/* ------------------------------------------------------------------ */

export async function getProPayouts(proId: string): Promise<PayoutRecord[]> {
  return pb.collection('payouts').getFullList<PayoutRecord>({
    filter: `pro_id="${proId}"`,
    sort: '-created',
    expand: 'job_id,job_id.service_id',
  })
}

export async function getAllPayouts(filterStatus?: string): Promise<PayoutRecord[]> {
  const filter = filterStatus && filterStatus !== 'all' ? `status="${filterStatus}"` : ''
  return pb.collection('payouts').getFullList<PayoutRecord>({
    filter,
    sort: '-created',
    expand: 'pro_id,job_id,job_id.service_id',
  })
}

export async function markPayoutAsPaid(payoutId: string, notes?: string): Promise<PayoutRecord> {
  return pb.collection('payouts').update<PayoutRecord>(payoutId, {
    status: 'paid',
    paid_at: new Date().toISOString(),
    method: 'pix',
    notes: notes || '',
  })
}

export async function markPayoutAsFailed(payoutId: string, notes: string): Promise<PayoutRecord> {
  return pb.collection('payouts').update<PayoutRecord>(payoutId, {
    status: 'failed',
    notes: notes || 'Falha ao processar repasse.',
  })
}
