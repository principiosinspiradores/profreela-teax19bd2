import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin,
  Calendar as CalendarIcon,
  Info,
  Zap,
  Clock,
  Users,
  Minus,
  Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { getServices, createJob, getMapsApiKey } from '@/services/api'
import { getSettings, DEFAULT_SETTINGS, type PlatformSettings } from '@/services/settings'
import { getHourMultiplier, shortJobBand, getTravelFee } from '@/lib/pricing'
import { combineDateAndTime, formatTimeRange } from '@/lib/scheduling'
import { getSavedLocations, type SavedLocation } from '@/services/locations'
import { useAuth } from '@/hooks/use-auth'
import AddressAutocomplete, { type ParsedAddress } from '@/components/AddressAutocomplete'
import { geocodeAddress } from '@/services/googleMaps'

export default function RequestService() {
  const [date, setDate] = useState<Date>()
  const [time, setTime] = useState('08:00')
  const [type, setType] = useState('scheduled')
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [address, setAddress] = useState('')
  const [hours, setHours] = useState(4)
  const [quantity, setQuantity] = useState(1)
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([])
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null)
  // Parsed components from the selected Google Places suggestion. Stored so we
  // can build a canonical full address string and reuse the lat/lng on submit.
  const [parsedAddr, setParsedAddr] = useState<ParsedAddress | null>(null)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
    getServices().then(setServices)
    getMapsApiKey()
      .then(setMapsApiKey)
      .catch(() => {})
    if (user) {
      getSavedLocations(user.id)
        .then(setSavedLocations)
        .catch(() => {})
    }
  }, [user])

  const minHours = Math.max(1, Math.round(settings.min_hours || DEFAULT_SETTINGS.min_hours))
  const maxHours = 12

  const activeService = services.find((s) => s.id === selectedService)
  const isEmergency = type === 'emergency'
  const basePrice = activeService ? activeService.base_price : 0

  // The base price is the per-hour rate. The client selects how many hours of
  // service they need; the labour cost scales linearly with that. Jobs shorter
  // than the configured normal-hours threshold carry a surcharge multiplier
  // (short jobs are less attractive to the professional).
  const safeHours = Math.max(minHours, Math.min(maxHours, Number(hours) || minHours))
  const hourMultiplier = getHourMultiplier(safeHours, settings)
  const effectiveHourly = basePrice * hourMultiplier
  const labourCost = effectiveHourly * safeHours

  // Mock distance calculation (e.g. 5km). In production this would come from
  // the Google Maps distance-matrix proxy using the client & pro coordinates.
  const distanceKm = 5.2
  const distanceFee = getTravelFee(distanceKm, settings)

  const emergencyMultiplier = isEmergency ? 1.2 : 1.0
  // Unit price = a single professional's job cost (labour + travel + emergency)
  const unitPrice = (labourCost + distanceFee) * emergencyMultiplier
  // When the client requests N professionals, N independent jobs are created.
  const quantityClamped = Math.max(1, Math.min(20, Math.round(quantity) || 1))
  const totalPrice = unitPrice * quantityClamped
  const band = shortJobBand(safeHours, settings)

  // Full scheduled datetime (date + time) with the -03:00 timezone offset, so
  // the conflict-overlap hook can compute real [start, end) windows.
  const scheduledAt = !isEmergency && date ? combineDateAndTime(date, time) : undefined
  const hasScheduledSlot = !!scheduledAt

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !user) return

    setLoading(true)
    try {
      // Build the full address string used for geocoding, preferring the
      // parsed components from the Google Places suggestion when available.
      const p = parsedAddr
      const enderecoCompleto = p
        ? `${p.street}, ${p.number} - ${p.neighborhood}, ${p.city} - ${p.state}`.replace(
            ' - ,',
            ',',
          )
        : address

      // Geocode the address to obtain real coordinates (no more hardcoded
      // lat/lng). If the Places suggestion already gave us a location we use
      // it directly; otherwise we call the server-side geocode proxy.
      let lat = parsedAddr?.lat
      let lng = parsedAddr?.lng
      if (lat == null || lng == null) {
        const geo = await geocodeAddress(enderecoCompleto)
        if (!geo) {
          toast({
            title: 'Endereço inválido',
            description: 'Não foi possível localizar o endereço. Verifique e tente novamente.',
            variant: 'destructive',
          })
          setLoading(false)
          return
        }
        lat = geo.lat
        lng = geo.lng
      }

      // Each requested professional becomes its own independent job. The client
      // clicks once; we create N separate `jobs` records (one per pro) so each
      // can be accepted, tracked and paid independently.
      const basePayload = {
        customer_id: user.id,
        service_id: selectedService,
        status: 'pending',
        price: unitPrice,
        hours: safeHours,
        type,
        address: enderecoCompleto,
        latitude: lat,
        longitude: lng,
        scheduled_at: isEmergency ? new Date().toISOString() : scheduledAt,
      }
      const tasks = Array.from({ length: quantityClamped }, () => createJob(basePayload))
      await Promise.all(tasks)
      // Build the post-submit summary including the scheduled time window when
      // available, so the client sees the real start/end of the service.
      const slotSummary =
        !isEmergency && scheduledAt ? ` ${formatTimeRange(scheduledAt, safeHours)}.` : ''
      toast({
        title: 'Solicitação Criada!',
        description:
          (quantityClamped > 1
            ? `${quantityClamped} solicitações criadas. Buscando profissionais na sua região...`
            : 'Buscando o melhor profissional na sua região...') + slotSummary,
        className: 'bg-primary text-white border-none',
      })
      navigate('/client')
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível criar.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nova Solicitação</h1>
        <p className="text-muted-foreground">Preencha os dados para encontrar um profissional.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalhes do Serviço</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Profissional</Label>
                  <Select value={selectedService} onValueChange={setSelectedService} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} - R$ {s.base_price.toFixed(2)}/h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Endereço do Local</Label>
                  <AddressAutocomplete
                    value={address}
                    onChange={(v) => {
                      setAddress(v)
                      // Typing manually invalidates the previously selected
                      // parsed suggestion; coordinates will be re-resolved on
                      // submit via the geocode proxy.
                      setParsedAddr(null)
                    }}
                    onSelect={(parsed) => setParsedAddr(parsed)}
                    apiKey={mapsApiKey}
                    required
                  />
                  {savedLocations.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {savedLocations.map((loc) => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            setAddress(loc.address)
                            setParsedAddr(null)
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors',
                            address === loc.address
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input hover:bg-muted',
                          )}
                        >
                          <MapPin className="h-3 w-3" />
                          {loc.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <Label>Modalidade</Label>
                  <RadioGroup
                    value={type}
                    onValueChange={setType}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 data-[state=checked]:border-primary transition-colors">
                      <RadioGroupItem value="scheduled" id="scheduled" />
                      <Label htmlFor="scheduled" className="flex-1 cursor-pointer">
                        <span className="block font-medium">Agendado</span>
                        <span className="text-xs text-muted-foreground">Data e hora marcadas</span>
                      </Label>
                    </div>
                    <div
                      className={cn(
                        'flex items-center space-x-2 border rounded-lg p-4 cursor-pointer transition-colors',
                        isEmergency ? 'border-accent bg-accent/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <RadioGroupItem value="emergency" id="emergency" />
                      <Label htmlFor="emergency" className="flex-1 cursor-pointer">
                        <span className="block font-medium text-accent flex items-center gap-1">
                          <Zap className="h-3 w-3" /> Emergência
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Atendimento imediato (+20%)
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label>Horas Estimadas</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={minHours}
                      max={maxHours}
                      step={1}
                      className="pl-9"
                      value={hours}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setHours(Number.isNaN(v) ? minHours : v)
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mínimo de {minHours}h (jobs curtos recebem sobretaxa). O preço final é
                    proporcional às horas informadas.
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-1">
                    <Users className="h-4 w-4" /> Quantos profissionais?
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantityClamped <= 1}
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      className="text-center font-medium"
                      value={quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setQuantity(Number.isNaN(v) ? 1 : v)
                      }}
                      onBlur={() => setQuantity(quantityClamped)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                      disabled={quantityClamped >= 20}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Serão criadas {quantityClamped} solicitaç{quantityClamped > 1 ? 'ões' : 'ão'}{' '}
                    independente{quantityClamped > 1 ? 's' : ''} (1 a 20 profissionais).
                  </p>
                </div>

                {!isEmergency && (
                  <div className="space-y-2 pt-4 border-t animate-fade-in">
                    <Label>Data e Horário do Serviço</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'flex-1 justify-start text-left font-normal',
                              !date && 'text-muted-foreground',
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? (
                              format(date, 'PPP', { locale: ptBR })
                            ) : (
                              <span>Escolha uma data</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <div className="relative sm:w-32">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="time"
                          className="pl-9 sm:w-32"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selecione o dia e o horário de início. O serviço será agendado no fuso horário
                      de Brasília (UTC-3).
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-24 bg-slate-50">
              <CardHeader>
                <CardTitle className="text-lg">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor/hora base</span>
                  <span>R$ {basePrice.toFixed(2)}</span>
                </div>
                {band && (
                  <div className="flex justify-between text-sm text-amber-700 font-medium">
                    <span className="flex items-center gap-1">
                      Sobretaxa job curto ({band.label}) <Info className="h-3 w-3" />
                    </span>
                    <span>{band.multiplier.toFixed(2)}×</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Valor/hora efetivo {band ? `(${hourMultiplier.toFixed(2)}×)` : ''}
                  </span>
                  <span>R$ {effectiveHourly.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mão de obra ({safeHours}h)</span>
                  <span>R$ {labourCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Deslocamento ({distanceKm}km)</span>
                  <span>R$ {distanceFee.toFixed(2)}</span>
                </div>
                {isEmergency && (
                  <div className="flex justify-between text-sm text-accent font-medium">
                    <span className="flex items-center gap-1">
                      Taxa Emergência <Info className="h-3 w-3" />
                    </span>
                    <span>+ R$ {(labourCost * 0.2).toFixed(2)}</span>
                  </div>
                )}
                {hasScheduledSlot && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Horário</span>
                    <span className="font-medium">{formatTimeRange(scheduledAt!, safeHours)}</span>
                  </div>
                )}
                <div className="border-t pt-4 mt-2 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Custo por profissional</span>
                    <span>R$ {unitPrice.toFixed(2)}</span>
                  </div>
                  {quantityClamped > 1 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantidade ({quantityClamped}×)</span>
                      <span>R$ {totalPrice.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center font-bold text-xl">
                    <span>{quantityClamped > 1 ? 'Total' : 'Total'}</span>
                    <span>R$ {totalPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {quantityClamped > 1
                      ? `${quantityClamped} profissionais × R$ ${unitPrice.toFixed(2)}`
                      : 'Preço dinâmico sujeito a região'}
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full h-12 text-lg"
                  disabled={loading || !selectedService || (!isEmergency && !date)}
                >
                  {loading
                    ? 'Enviando...'
                    : quantityClamped > 1
                      ? `Confirmar ${quantityClamped} Pedidos`
                      : 'Confirmar Pedido'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
