import pb from '@/lib/pocketbase/client'

/**
 * Platform business-rule settings.
 * Publicly readable, admin-writable. Sensitive keys (Google Maps, Stripe)
 * are intentionally NOT part of this object — they live in env secrets.
 */
export interface PlatformSettings {
  id?: string
  name?: string
  service_fee_percent: number
  emergency_margin_percent: number
  scheduled_margin_percent: number
  demand_factors: {
    low?: number
    medium?: number
    high?: number
    peak?: number
    [k: string]: number | undefined
  }
  price_per_hour: number
  min_service_fee: number
  module_chat_enabled: boolean
  module_reviews_enabled: boolean
  module_referrals_enabled: boolean
  module_dynamic_pricing_enabled: boolean
  updated?: string
}

const DEFAULT_SETTINGS: PlatformSettings = {
  service_fee_percent: 15,
  emergency_margin_percent: 25,
  scheduled_margin_percent: 10,
  demand_factors: { low: 0.9, medium: 1.0, high: 1.2, peak: 1.5 },
  price_per_hour: 2.5,
  min_service_fee: 5,
  module_chat_enabled: true,
  module_reviews_enabled: true,
  module_referrals_enabled: true,
  module_dynamic_pricing_enabled: true,
}

/** Fetch the current platform settings (public). Falls back to defaults. */
export async function getSettings(): Promise<PlatformSettings> {
  try {
    const res = await pb.send('/backend/v1/settings', { method: 'GET' })
    if (res?.ok && res.settings) {
      return { ...DEFAULT_SETTINGS, ...res.settings } as PlatformSettings
    }
  } catch (_) {
    // ignore — fall through to defaults
  }
  return DEFAULT_SETTINGS
}

/**
 * Update platform settings (admin only). Sends only the provided fields.
 * Returns the updated settings object.
 */
export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const res = await pb.send('/backend/v1/settings', {
    method: 'PUT',
    body: patch,
  })
  if (!res?.ok) {
    throw new Error(res?.error || 'Falha ao salvar configurações.')
  }
  return { ...DEFAULT_SETTINGS, ...(res.settings || {}) } as PlatformSettings
}

export { DEFAULT_SETTINGS }
