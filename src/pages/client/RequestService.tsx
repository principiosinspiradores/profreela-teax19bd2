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
import { getServices, createJob } from '@/services/api'
import { getSettings, DEFAULT_SETTINGS, type PlatformSettings } from '@/services/settings'
import { getHourMultiplier, shortJobBand, getTravelFee } from '@/lib/pricing'
import { useAuth } from '@/hooks/use-auth'

export default function RequestService() {
  const [date, setDate] = useState<Date>()
  const [type, setType] = useState('scheduled')
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [address, setAddress] = useState('Av. Aquidabã, 400 - Centro, Campinas')
  const [hours, setHours] = useState(4)
  const [quantity, setQuantity] = useState(1)
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
    getServices().then(setServices)
  }, [])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !user) return

    setLoading(true)
    try {
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
        address,
        latitude: -22.9099,
        longitude: -47.0626,
        scheduled_at: isEmergency
          ? new Date().toISOString()
          : date
            ? date.toISOString()
            : undefined,
      }
      const tasks = Array.from({ length: quantityClamped }, () => createJob(basePayload))
      await Promise.all(tasks)
      toast({
        title: 'Solicitação Criada!',
        description:
          quantityClamped > 1
            ? `${quantityClamped} solicitações criadas. Buscando profissionais na sua região...`
            : 'Buscando o melhor profissional na sua região...',
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
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Rua, Número, Bairro"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
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
                    <Label>Data do Serviço</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={'outline'}
                          className={cn(
                            'w-full justify-start text-left font-normal',
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
                  disabled={loading || !selectedService}
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
