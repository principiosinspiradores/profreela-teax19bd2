import { useEffect, useRef, useState, useCallback } from 'react'
import { MapPin, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Parsed address components returned by Google Places Autocomplete.
 */
export interface ParsedAddress {
  street: string
  number: string
  neighborhood: string
  city: string
  state: string
  postalCode: string
  formattedAddress: string
  lat: number
  lng: number
}

interface AddressAutocompleteProps {
  /** Controlled text value (the formatted address string). */
  value: string
  /** Called whenever the raw input text changes (typing). */
  onChange: (value: string) => void
  /** Called when the user selects a suggestion from the dropdown. */
  onSelect: (parsed: ParsedAddress) => void
  /** Optional placeholder. */
  placeholder?: string
  /** Optional className applied to the wrapper. */
  className?: string
  /** Google Maps API key. If omitted, the component is read-only-ish. */
  apiKey?: string | null
  /** Forward the HTML `required` attribute to the input element. */
  required?: boolean
}

declare global {
  interface Window {
    google?: any
    __gMapsPlacesLoaded?: boolean
    __gMapsPlacesLoading?: Promise<void> | null
  }
}

/**
 * Load the Google Maps JavaScript API with the `places` library exactly once
 * per page. Returns a promise that resolves with `window.google.maps`.
 */
function loadGoogleMapsScript(apiKey: string): Promise<any> {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps)
  }
  if (window.__gMapsPlacesLoading) {
    return window.__gMapsPlacesLoading.then(() => window.google.maps)
  }
  const url = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
    apiKey,
  )}&libraries=places&language=pt-BR&region=BR&v=weekly`
  window.__gMapsPlacesLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.defer = true
    script.onload = () => {
      window.__gMapsPlacesLoaded = true
      resolve()
    }
    script.onerror = () => {
      window.__gMapsPlacesLoading = null
      reject(new Error('Falha ao carregar Google Maps.'))
    }
    document.head.appendChild(script)
  })
  return window.__gMapsPlacesLoading.then(() => window.google.maps)
}

/** Read a component by type from the Google address_components array. */
function getComponent(components: any[], type: string, short = false): string {
  const c = components.find((cmp: any) => cmp.types.includes(type))
  return c ? (short ? c.short_name : c.long_name) : ''
}

/** Convert a Google Places `PlaceResult` into a structured ParsedAddress. */
function parsePlace(place: any): ParsedAddress | null {
  if (!place || !place.geometry?.location) return null
  const comps = place.address_components || []
  const lat = place.geometry.location.lat()
  const lng = place.geometry.location.lng()
  return {
    street: getComponent(comps, 'route') || '',
    number: getComponent(comps, 'street_number') || '',
    neighborhood:
      getComponent(comps, 'sublocality_level_1') || getComponent(comps, 'sublocality') || '',
    city:
      getComponent(comps, 'administrative_area_level_2') || getComponent(comps, 'locality') || '',
    state: getComponent(comps, 'administrative_area_level_1', true) || '',
    postalCode: getComponent(comps, 'postal_code') || '',
    formattedAddress: place.formatted_address || '',
    lat,
    lng,
  }
}

/**
 * Address input backed by Google Places Autocomplete. Renders suggestions in a
 * dropdown as the user types; on selection it parses the address components
 * (street, number, neighborhood, city, state, postal code) and the lat/lng.
 *
 * Uses the Google Maps JavaScript API loaded via a dynamically injected script
 * tag (no extra npm dependency required).
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Rua, Número, Bairro',
  className,
  apiKey,
  required,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Initialise the Autocomplete widget once the script + API key are available.
  useEffect(() => {
    if (!apiKey || !inputRef.current) return
    let cancelled = false
    setLoading(true)
    setError(false)
    loadGoogleMapsScript(apiKey)
      .then((maps) => {
        if (cancelled || !inputRef.current) return
        if (autocompleteRef.current) return
        autocompleteRef.current = new maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'br' },
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        })
        autocompleteRef.current.addListener('place_changed', () => {
          const place = autocompleteRef.current.getPlace()
          const parsed = parsePlace(place)
          if (parsed) {
            onChange(parsed.formattedAddress || value)
            onSelect(parsed)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  const clear = useCallback(() => {
    onChange('')
    if (inputRef.current) inputRef.current.value = ''
  }, [onChange])

  return (
    <div className={cn('relative', className)}>
      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        required={required}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Limpar endereço"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {loading && (
        <Loader2 className="absolute right-8 top-3 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {error && (
        <p className="absolute left-0 top-full mt-1 text-xs text-destructive">
          Não foi possível carregar o autocomplete de endereço.
        </p>
      )}
    </div>
  )
}
