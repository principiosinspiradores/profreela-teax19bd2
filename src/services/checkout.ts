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

/**
 * Payment gateway integration (Stripe / Mercado Pago).
 *
 * Public keys are fetched from the backend (which reads them from env secrets)
 * so the client can bootstrap the gateway SDK. The SECRET keys live only in the
 * backend environment and are used server-side to create the charge with a
 * platform-fee split (the platform keeps the configured service fee).
 */

/** Get the configured gateway + its public key (or null if none configured). */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await pb.send('/api/backend/v1/payments/config', { method: 'GET' })
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
 * Create a payment intent with the platform-fee split applied.
 * The backend reads the service fee from the `settings` collection and uses the
 * configured gateway's secret key to create the charge (Stripe Connect transfer
 * or Mercado Pago marketplace split).
 */
export async function createSplitPayment(params: {
  amount: number
  currency?: string
  proAccountId: string
  description?: string
}): Promise<any> {
  const res = await pb.send('/api/backend/v1/payments/create-split', {
    method: 'POST',
    body: {
      amount: params.amount,
      currency: params.currency || 'brl',
      proAccountId: params.proAccountId,
      description: params.description || 'Serviço ProFreela',
    },
  })
  return res
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
