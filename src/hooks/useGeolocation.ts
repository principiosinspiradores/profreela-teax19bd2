import { useEffect, useRef, useState } from 'react'

export interface GeoCoords {
  latitude: number
  longitude: number
  accuracy?: number
}

export type GeoError =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | string

export interface UseGeolocationResult {
  coords: GeoCoords | null
  error: GeoError | null
  loading: boolean
}

/**
 * Tracks the device's GPS position in real time using
 * `navigator.geolocation.watchPosition`. Stops tracking on unmount via
 * `clearWatch`. Returns a friendly `error` code when geolocation is
 * unavailable or permission is denied.
 *
 * Pass `enabled = false` to avoid starting the watcher (e.g. when the screen
 * isn't in the transit step yet).
 */
export function useGeolocation(enabled = true): UseGeolocationResult {
  const [coords, setCoords] = useState<GeoCoords | null>(null)
  const [error, setError] = useState<GeoError | null>(null)
  const [loading, setLoading] = useState(enabled)
  const watchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setLoading(false)
      return
    }

    if (!('geolocation' in navigator)) {
      setError('UNSUPPORTED')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setLoading(false)
        setError(null)
      },
      (err) => {
        let code: GeoError
        switch (err.code) {
          case err.PERMISSION_DENIED:
            code = 'PERMISSION_DENIED'
            break
          case err.POSITION_UNAVAILABLE:
            code = 'POSITION_UNAVAILABLE'
            break
          case err.TIMEOUT:
            code = 'TIMEOUT'
            break
          default:
            code = err.message || 'UNKNOWN'
        }
        setError(code)
        setLoading(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    )

    watchIdRef.current = id

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled])

  return { coords, error, loading }
}
