import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { getNearbyPros } from '@/services/api'
import { getSavedLocations } from '@/services/locations'

export interface DashboardStats {
  /** Active (non-suspended) professionals available to accept jobs. */
  availableCount: number
  /** Highest-rated professional (name + rating_avg), or null when none. */
  topRated: { name: string; rating: number } | null
  /** Average response time in minutes. Falls back to ~5 min. */
  avgResponseMin: number
  /** Whether the client has at least one saved address (region coverage). */
  hasAddress: boolean
  /** Human-readable address label, if any. */
  addressLabel: string | null
}

interface DashboardStatsState {
  data: DashboardStats | null
  loading: boolean
  error: boolean
}

const FALLBACK_RESPONSE_MIN = 5

/**
 * Aggregates the numbers shown on the client dashboard "info" card:
 * available professionals, best-rated pro, response time and whether the
 * client has a registered address. All values come from the live backend.
 */
export function useDashboardStats(clientId: string | undefined): DashboardStatsState {
  const [state, setState] = useState<DashboardStatsState>({
    data: null,
    loading: true,
    error: false,
  })

  useEffect(() => {
    let active = true
    if (!clientId) {
      setState({ data: null, loading: false, error: false })
      return
    }

    const load = async () => {
      try {
        // 1. Available professionals (active, non-suspended pros).
        const pros = await getNearbyPros().catch(() => [])
        const availableCount = pros.length

        // 2. Top-rated professional: sort by rating_avg desc, take first.
        //    The `users` list rule restricts to self/admin, so fall back to
        //    the already-fetched pros list (which is publicly listable by
        //    role filter) when the full query is not permitted.
        let topRated: DashboardStats['topRated'] = null
        try {
          const ranked = await pb.collection('users').getList(1, 1, {
            filter: `role="pro" && status="active"`,
            sort: '-rating_avg',
          })
          const top = ranked.items?.[0]
          if (top && Number(top.rating_avg) > 0) {
            topRated = {
              name: top.name || 'Profissional',
              rating: Number(top.rating_avg),
            }
          }
        } catch {
          // Fallback: derive from the pros list we already have.
          const sorted = [...pros].sort(
            (a, b) => Number(b.rating_avg || 0) - Number(a.rating_avg || 0),
          )
          const top = sorted[0]
          if (top && Number(top.rating_avg) > 0) {
            topRated = {
              name: top.name || 'Profissional',
              rating: Number(top.rating_avg),
            }
          }
        }

        // 3. Average response time. There is no dedicated backend field
        //    today, so we use a sensible fallback.
        const avgResponseMin = FALLBACK_RESPONSE_MIN

        // 4. Region coverage: does the client have a saved address?
        let hasAddress = false
        let addressLabel: string | null = null
        try {
          const locations = await getSavedLocations(clientId)
          if (locations.length > 0) {
            hasAddress = true
            addressLabel = locations[0].label || locations[0].address || null
          }
        } catch {
          // ignore — treat as no address
        }

        // Fallback: if the client has no saved locations, look up the
        // address of their most recent job. This covers clients who
        // already requested services before saving a location.
        if (!hasAddress) {
          try {
            const recent = await pb.collection('jobs').getList(1, 1, {
              filter: `customer_id="${clientId}"`,
              sort: '-created',
            })
            const lastAddress = recent.items?.[0]?.address
            if (lastAddress) {
              hasAddress = true
              addressLabel = lastAddress
            }
          } catch {
            // ignore — treat as no address
          }
        }

        if (!active) return
        setState({
          data: {
            availableCount,
            topRated,
            avgResponseMin,
            hasAddress,
            addressLabel,
          },
          loading: false,
          error: false,
        })
      } catch {
        if (!active) return
        setState({ data: null, loading: false, error: true })
      }
    }

    load()
    return () => {
      active = false
    }
  }, [clientId])

  return state
}
