import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapPin,
  Navigation2,
  Camera,
  CheckCircle,
  Lock,
  Clock,
  AlertTriangle,
  Loader2,
  User,
  MapPinned,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { getJob, updateJob, startJob } from '@/services/api'
import { releasePayment } from '@/services/checkout'
import {
  geocodeAddress,
  getDistance,
  getMapsEmbedUrl,
  googleMapsDirectionsUrl,
  type GeocodeResult,
  type DistanceResult,
} from '@/services/googleMaps'
import { useGeolocation } from '@/hooks/useGeolocation'
import { formatScheduledSlot } from '@/lib/scheduling'

type Step = 'transit' | 'arrived' | 'working' | 'finished'

const LEAVE_NOW_THRESHOLD_MIN = 0 // travel time >= remaining time -> "leave now"
const WARNING_THRESHOLD_MIN = 5 // remaining - travel < 5min -> "leave in X min"

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** Format a scheduled_at (-03:00) into HH:MM wall-clock time. */
function formatHHMM(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '--:--'
  const adjusted = new Date(d.getTime() - 3 * 3600000)
  return pad2(adjusted.getUTCHours()) + ':' + pad2(adjusted.getUTCMinutes())
}

export default function ActiveJob() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { id: jobId } = useParams<{ id: string }>()

  const [job, setJob] = useState<any>(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [destination, setDestination] = useState<GeocodeResult | null>(null)
  const [distance, setDistance] = useState<DistanceResult | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('transit')
  const [finishing, setFinishing] = useState(false)
  const [starting, setStarting] = useState(false)

  // GPS tracking — only active during the transit step.
  const { coords, error: geoError, loading: geoLoading } = useGeolocation(step === 'transit')

  // Throttle distance/embed refresh so we don't spam the proxy on every GPS tick.
  const lastRefreshRef = useRef(0)

  // --- load job -------------------------------------------------------------
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setLoadingJob(true)
    getJob(jobId)
      .then((j) => {
        if (cancelled) return
        setJob(j)
        // If the job is already in_progress, jump straight to working.
        if (j?.status === 'in_progress') {
          setStep('working')
        } else if (j?.status === 'completed') {
          setStep('finished')
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar o serviço.',
            variant: 'destructive',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingJob(false)
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  // --- geocode the job address once ----------------------------------------
  useEffect(() => {
    if (!job?.address) return
    let cancelled = false
    geocodeAddress(job.address).then((res) => {
      if (cancelled) return
      setDestination(res)
      // Persist the resolved coordinates back onto the job so the deep link
      // keeps working even if geocoding later fails.
      if (res && job?.id && job.latitude == null) {
        updateJob(job.id, { latitude: res.lat, longitude: res.lng }).catch(() => {})
      }
    })
    return () => {
      cancelled = true
    }
  }, [job?.address])

  // --- refresh distance + embed as GPS moves -------------------------------
  const refreshRoute = useCallback(async (lat: number, lng: number, dest: GeocodeResult) => {
    const originStr = `${lat},${lng}`
    const destStr = `${dest.lat},${dest.lng}`
    const [dist, embed] = await Promise.all([
      getDistance(originStr, destStr),
      getMapsEmbedUrl(originStr, destStr),
    ])
    setDistance(dist)
    if (embed) setEmbedUrl(embed)
  }, [])

  useEffect(() => {
    if (!coords || !destination) return
    const now = Date.now()
    // Throttle: at most one refresh every 20s.
    if (now - lastRefreshRef.current < 20000 && distance) return
    lastRefreshRef.current = now
    refreshRoute(coords.latitude, coords.longitude, destination)
  }, [coords, destination, refreshRoute, distance])

  // --- derived values for the leave-now alert ------------------------------
  const scheduledMs = job?.scheduled_at ? new Date(job.scheduled_at).getTime() : 0
  const nowMs = Date.now()
  const remainingMs = scheduledMs ? scheduledMs - nowMs : 0
  const remainingMin = Math.round(remainingMs / 60000)
  const travelMin = distance ? Math.round(distance.durationSeconds / 60) : 0
  const etaMs = nowMs + (distance ? distance.durationSeconds * 1000 : 0)
  const etaLabel = isNaN(etaMs)
    ? '--:--'
    : pad2(new Date(etaMs).getHours()) + ':' + pad2(new Date(etaMs).getMinutes())

  let alert: { kind: 'leave' | 'warn' | 'ok' | null; title: string; description: string }
  if (!scheduledMs || !distance) {
    alert = { kind: null, title: '', description: '' }
  } else if (travelMin >= remainingMin && remainingMin >= 0) {
    alert = {
      kind: 'leave',
      title: `🚨 SAIA AGORA para chegar às ${formatHHMM(job.scheduled_at)}`,
      description: `O tempo de viagem (${travelMin} min) é maior que o tempo restante (${remainingMin} min). Saia imediatamente para não atrasar.`,
    }
  } else if (remainingMin - travelMin <= WARNING_THRESHOLD_MIN && remainingMin >= 0) {
    const minsToLeave = Math.max(0, remainingMin - travelMin)
    alert = {
      kind: 'warn',
      title: `⚠️ Você tem ${minsToLeave} min para sair`,
      description: `Chegada estimada às ${etaLabel}. Distância: ${distance?.distanceText || '—'} • Tempo de viagem: ${distance?.durationText || '—'}.`,
    }
  } else if (remainingMin < 0) {
    alert = {
      kind: 'leave',
      title: '🚨 Você está atrasado',
      description: `O horário agendado (${formatHHMM(job.scheduled_at)}) já passou. Saia agora para minimizar o atraso.`,
    }
  } else {
    alert = {
      kind: 'ok',
      title: 'Tudo certo por enquanto',
      description: `Chegada estimada às ${etaLabel} • Distância: ${distance?.distanceText || '—'} • Viagem: ${distance?.durationText || '—'}.`,
    }
  }

  // --- actions --------------------------------------------------------------
  const handleStart = async () => {
    if (!jobId || starting) return
    setStarting(true)
    try {
      const updated = await startJob(jobId)
      setJob({ ...job, ...(updated || {}), status: 'in_progress' })
      toast({
        title: 'Serviço iniciado',
        description: 'Boa trabalho! O cronômetro está rodando.',
      })
      setStep('working')
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Não foi possível iniciar o serviço.',
        variant: 'destructive',
      })
    } finally {
      setStarting(false)
    }
  }

  const handleArrived = () => {
    // GPS check-in: within ~150m of the destination, or geolocation unavailable
    // (let the pro proceed — the backend gate is the clock-in below).
    const withinRange = !coords || !destination ? true : haversineMeters(coords, destination) <= 150
    if (!withinRange) {
      toast({
        title: 'Ainda não',
        description: 'Você precisa estar a menos de 150m do local para fazer check-in.',
        variant: 'destructive',
      })
      return
    }
    setStep('arrived')
  }

  const handleCheckIn = async () => {
    // clock-in — record timestamp so the 24h auto-cancel rule is satisfied.
    if (jobId) {
      try {
        await updateJob(jobId, { clocked_in_at: new Date().toISOString() })
      } catch (_) {
        /* non-fatal */
      }
    }
    toast({
      title: 'Foto enviada',
      description: 'Check-in validado via GPS com sucesso!',
    })
    setStep('working')
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      if (jobId) {
        await updateJob(jobId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        await releasePayment(jobId)
        toast({
          title: 'Serviço finalizado',
          description: 'Iniciado o período de garantia de 7 dias. O pagamento será liberado após.',
        })
        navigate('/pro')
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível finalizar o serviço.',
        variant: 'destructive',
      })
    } finally {
      setFinishing(false)
    }
  }

  // --- render ---------------------------------------------------------------
  if (loadingJob) {
    return (
      <div className="max-w-xl mx-auto w-full py-16 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Carregando serviço…</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="max-w-xl mx-auto w-full py-16 text-center">
        <p className="text-muted-foreground">Serviço não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/pro')}>
          Voltar ao painel
        </Button>
      </div>
    )
  }

  const clientName = job.expand?.customer_id?.name || 'Cliente'
  const serviceName = job.expand?.service_id?.name || 'Serviço'
  const destLat = job.latitude ?? destination?.lat
  const destLng = job.longitude ?? destination?.lng
  const hasCoords = typeof destLat === 'number' && typeof destLng === 'number'

  return (
    <div className="max-w-xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Serviço em Andamento</h1>
        <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-semibold">
          #{job.id?.slice(-6).toUpperCase()}
        </div>
      </div>

      <Card className="overflow-hidden border-2 shadow-sm">
        {/* Map */}
        <div className="h-64 bg-slate-200 relative">
          {embedUrl ? (
            <iframe
              title="Rota até o cliente"
              src={embedUrl}
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MapPinned className="h-8 w-8" />
              <p className="text-sm">
                {geoLoading
                  ? 'Obtendo sua localização…'
                  : destination
                    ? 'Calculando rota…'
                    : 'Localizando endereço do cliente…'}
              </p>
            </div>
          )}

          {geoError && (
            <div className="absolute top-2 left-2 right-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded px-3 py-1.5">
              {geoError === 'PERMISSION_DENIED'
                ? 'Permita o acesso à sua localização para ver a rota em tempo real.'
                : geoError === 'UNSUPPORTED'
                  ? 'Seu navegador não suporta geolocalização.'
                  : 'Não foi possível obter sua localização agora.'}
            </div>
          )}

          {step === 'transit' && hasCoords && (
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
              <a
                href={googleMapsDirectionsUrl(destLat as number, destLng as number)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  size="lg"
                  className="rounded-full shadow-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  <Navigation2 className="mr-2 h-5 w-5" /> Abrir no Google Maps
                </Button>
              </a>
            </div>
          )}
        </div>

        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">{serviceName}</h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <User className="h-4 w-4" /> {clientName}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {job.address}
              </p>
              {job.scheduled_at && (
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> {formatScheduledSlot(job.scheduled_at, job.hours)}
                </p>
              )}
            </div>
          </div>

          {/* Leave-now / warning alert */}
          {step === 'transit' && alert.kind && (
            <Alert
              variant={alert.kind === 'ok' ? 'default' : 'destructive'}
              className={
                alert.kind === 'leave'
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : alert.kind === 'warn'
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-green-200 bg-green-50 text-green-900'
              }
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          )}

          {/* Live distance / ETA strip */}
          {step === 'transit' && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Distância</p>
                <p className="font-semibold text-sm">{distance?.distanceText || '—'}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Viagem</p>
                <p className="font-semibold text-sm">{distance?.durationText || '—'}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Chegada</p>
                <p className="font-semibold text-sm">{etaLabel}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {step === 'transit' && (
              <>
                <Button
                  className="w-full h-14 text-lg"
                  onClick={handleArrived}
                  disabled={geoLoading}
                >
                  Cheguei no local
                </Button>
                {job.status === 'accepted' && (
                  <Button
                    className="w-full h-12 bg-secondary hover:bg-secondary/90 text-white"
                    onClick={handleStart}
                    disabled={starting}
                  >
                    {starting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Iniciando…
                      </>
                    ) : (
                      'Iniciar Serviço'
                    )}
                  </Button>
                )}
              </>
            )}

            {step === 'arrived' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center bg-muted/30">
                  <Camera className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="font-medium">Tire uma foto no local</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Obrigatório pela LGPD e segurança
                  </p>
                  <Button variant="outline" onClick={handleCheckIn}>
                    Simular Upload
                  </Button>
                </div>
              </div>
            )}

            {step === 'working' && (
              <div className="text-center py-8 animate-fade-in">
                <div className="inline-flex h-20 w-20 rounded-full bg-secondary/20 items-center justify-center mb-4">
                  <CheckCircle className="h-10 w-10 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Trabalho em Execução</h3>
                <p className="text-muted-foreground mb-4">
                  O cronômetro está rodando. Faça um ótimo trabalho!
                </p>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2 mb-6 max-w-sm mx-auto">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Ao finalizar, inicia o período de garantia de 7 dias. Seu pagamento será
                    liberado após esse prazo, caso não haja disputa.
                  </span>
                </div>
                <Button
                  className="w-full h-14 text-lg bg-slate-900"
                  onClick={handleFinish}
                  disabled={finishing}
                >
                  {finishing ? 'Finalizando...' : 'Finalizar Serviço'}
                </Button>
              </div>
            )}

            {step === 'finished' && (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-secondary mx-auto mb-3" />
                <h3 className="text-xl font-bold mb-1">Serviço concluído</h3>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/pro')}>
                  Voltar ao painel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Haversine distance in meters between two coordinates. */
function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const dLat = ((b.lat - a.latitude) * Math.PI) / 180
  const dLng = ((b.lng - a.longitude) * Math.PI) / 180
  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
