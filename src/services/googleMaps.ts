import pb from '@/lib/pocketbase/client'

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress?: string
}

export interface DistanceResult {
  distanceMeters: number
  durationSeconds: number
  distanceText?: string
  durationText?: string
}

/**
 * Google Maps integration.
 *
 * The API key is stored ONLY in the backend secrets (GOOGLE_MAPS_API_KEY) and
 * is never exposed to the client. All Google calls are proxied through pb_hooks
 * so the key stays server-side.
 */

/** Geocode an address string into lat/lng coordinates. */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address.trim()) return null
  try {
    const res = await pb.send('/backend/v1/maps/geocode', {
      method: 'POST',
      body: { address },
    })
    const result = res?.results?.[0]
    if (!result) return null
    const loc = result.geometry?.location
    if (!loc) return null
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: result.formatted_address,
    }
  } catch (_) {
    return null
  }
}

/**
 * Compute driving distance + duration between an origin and a destination
 * (addresses or "lat,lng" strings).
 */
export async function getDistance(
  origins: string,
  destinations: string,
): Promise<DistanceResult | null> {
  if (!origins || !destinations) return null
  try {
    const res = await pb.send('/backend/v1/maps/distance', {
      method: 'POST',
      body: { origins, destinations },
    })
    const element = res?.rows?.[0]?.elements?.[0]
    if (!element || element.status !== 'OK') return null
    return {
      distanceMeters: element.distance?.value ?? 0,
      durationSeconds: element.duration?.value ?? 0,
      distanceText: element.distance?.text,
      durationText: element.duration?.text,
    }
  } catch (_) {
    return null
  }
}

/** Haversine distance in km between two coordinates (no API call needed). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
