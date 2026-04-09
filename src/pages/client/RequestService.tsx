import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Calendar as CalendarIcon, Info, Zap } from 'lucide-react'
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
import { useAuth } from '@/hooks/use-auth'

export default function RequestService() {
  const [date, setDate] = useState<Date>()
  const [type, setType] = useState('scheduled')
  const [services, setServices] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [address, setAddress] = useState('Av. Aquidabã, 400 - Centro, Campinas')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    getServices().then(setServices)
  }, [])

  const activeService = services.find((s) => s.id === selectedService)
  const isEmergency = type === 'emergency'
  const basePrice = activeService ? activeService.base_price : 0

  // Mock distance calculation (e.g. 5km)
  const distanceKm = 5.2
  const distanceFee = distanceKm * 2.5 // R$ 2.50 per km

  const multiplier = isEmergency ? 1.2 : 1.0
  const finalPrice = (basePrice + distanceFee) * multiplier

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService || !user) return

    setLoading(true)
    try {
      await createJob({
        customer_id: user.id,
        service_id: selectedService,
        status: 'pending',
        price: finalPrice,
        type,
        address,
        latitude: -22.9099,
        longitude: -47.0626,
        scheduled_at: isEmergency
          ? new Date().toISOString()
          : date
            ? date.toISOString()
            : undefined,
      })
      toast({
        title: 'Solicitação Criada!',
        description: 'Buscando o melhor profissional na sua região...',
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
                  <span className="text-muted-foreground">Diária Base</span>
                  <span>R$ {basePrice.toFixed(2)}</span>
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
                    <span>+ R$ {(basePrice * 0.2).toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-4 mt-2">
                  <div className="flex justify-between items-center font-bold text-xl">
                    <span>Total</span>
                    <span>R$ {finalPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    Preço dinâmico sujeito a região
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full h-12 text-lg"
                  disabled={loading || !selectedService}
                >
                  Confirmar Pedido
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
