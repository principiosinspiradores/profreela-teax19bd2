import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  Save,
  SlidersHorizontal,
  Wrench,
  TrendingUp,
  Gauge,
  Plus,
  Trash2,
  Hourglass,
  MapPin,
  Search,
  AlertCircle,
  CreditCard,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { geocodeAddress } from '@/services/googleMaps'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from '@/services/settings'
import { getServices, updateService, createService, deleteService } from '@/services/api'

interface ServiceForm {
  name: string
  description: string
  base_price: string
  icon: string
}

const EMPTY_FORM: ServiceForm = {
  name: '',
  description: '',
  base_price: '',
  icon: '',
}

export default function AdminPricing() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingServices, setSavingServices] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [geocodingCenter, setGeocodingCenter] = useState(false)
  const [centerAddressInput, setCenterAddressInput] = useState('')

  // Create-service dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM)

  // Delete-service confirmation state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), getServices()])
      .then(([s, svc]) => {
        setSettings(s)
        setServices(svc)
        setCenterAddressInput(s.service_center_address || '')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleGeocodeCenter = async () => {
    const query = centerAddressInput.trim()
    if (!query) {
      toast({
        title: 'Endereço vazio',
        description: 'Digite um endereço ou cidade para localizar o centro.',
        variant: 'destructive',
      })
      return
    }

    setGeocodingCenter(true)
    try {
      const result = await geocodeAddress(query)
      if (!result) {
        toast({
          title: 'Não encontrado',
          description: 'Não foi possível obter as coordenadas para o endereço informado.',
          variant: 'destructive',
        })
        return
      }

      setSettings((prev) => ({
        ...prev,
        service_center_lat: result.lat,
        service_center_lng: result.lng,
        service_center_address: result.formattedAddress || query,
      }))
      setCenterAddressInput(result.formattedAddress || query)

      toast({
        title: 'Centro localizado!',
        description: `Coordenadas: ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}. Salve as alterações para ativar.`,
      })
    } catch {
      toast({
        title: 'Erro de localização',
        description: 'Falha ao consultar o serviço de mapas.',
        variant: 'destructive',
      })
    } finally {
      setGeocodingCenter(false)
    }
  }

  const handleClearCenter = () => {
    setSettings((prev) => ({
      ...prev,
      service_center_lat: null,
      service_center_lng: null,
      service_center_address: '',
    }))
    setCenterAddressInput('')
  }

  const handleNumberChange = (key: keyof PlatformSettings, value: string) => {
    const num = value === '' ? 0 : parseFloat(value)
    setSettings((s) => ({ ...s, [key]: isNaN(num) ? 0 : num }))
  }

  const handleShortJobChange = (key: keyof PlatformSettings, value: string) => {
    const num = value === '' ? 0 : parseFloat(value)
    setSettings((s) => ({ ...s, [key]: isNaN(num) ? 0 : num }))
  }

  const handleFactorChange = (key: string, value: string) => {
    const num = value === '' ? 0 : parseFloat(value)
    setSettings((s) => ({
      ...s,
      demand_factors: { ...s.demand_factors, [key]: isNaN(num) ? 0 : num },
    }))
  }

  const handleServicePriceChange = (id: string, value: string) => {
    const num = value === '' ? 0 : parseFloat(value)
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, base_price: isNaN(num) ? 0 : num } : s)),
    )
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const updated = await updateSettings({
        emergency_margin_percent: settings.emergency_margin_percent,
        scheduled_margin_percent: settings.scheduled_margin_percent,
        demand_factors: settings.demand_factors,
        price_per_hour: settings.price_per_hour,
        min_hours: settings.min_hours,
        short_job_multiplier_4_5: settings.short_job_multiplier_4_5,
        short_job_multiplier_6_7: settings.short_job_multiplier_6_7,
        normal_hours_threshold: settings.normal_hours_threshold,
        distance_price_per_km: settings.distance_price_per_km,
        min_distance_fee: settings.min_distance_fee,
        flat_travel_fee: settings.flat_travel_fee,
        service_radius_km: settings.service_radius_km,
        service_center_lat: settings.service_center_lat,
        service_center_lng: settings.service_center_lng,
        service_center_address: centerAddressInput.trim() || settings.service_center_address,
        payments_demo_enabled: settings.payments_demo_enabled,
      })
      setSettings(updated)
      toast({
        title: 'Preços dinâmicos salvos',
        description: 'Fatores e margens atualizados com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar os preços dinâmicos.',
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSaveServices = async () => {
    setSavingServices(true)
    try {
      await Promise.all(services.map((s) => updateService(s.id, { base_price: s.base_price })))
      toast({
        title: 'Preços por serviço salvos',
        description: 'Os preços base por hora foram atualizados.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar serviços',
        description: err?.message || 'Não foi possível atualizar os preços dos serviços.',
        variant: 'destructive',
      })
    } finally {
      setSavingServices(false)
    }
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do serviço.',
        variant: 'destructive',
      })
      return
    }
    const priceNum = form.base_price === '' ? 0 : parseFloat(form.base_price)
    if (isNaN(priceNum) || priceNum < 0) {
      toast({
        title: 'Preço inválido',
        description: 'Informe um preço base válido.',
        variant: 'destructive',
      })
      return
    }
    setCreating(true)
    try {
      const created = await createService({
        name,
        description: form.description.trim(),
        base_price: priceNum,
      })
      setServices((prev) => [...prev, created])
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      toast({
        title: 'Serviço criado',
        description: `“${name}” foi adicionado à lista de serviços.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao criar serviço',
        description: err?.message || 'Não foi possível criar o serviço.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteService(deleteTarget.id)
      setServices((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      toast({
        title: 'Serviço removido',
        description: `“${deleteTarget.name}” foi excluído.`,
      })
      setDeleteTarget(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir serviço',
        description: err?.message || 'Não foi possível excluir o serviço.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando preços...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Preços Dinâmicos</h1>
        <p className="text-muted-foreground">
          Defina o preço base por hora de cada serviço e os fatores de demanda e margens.
        </p>
      </div>

      {/* Base price per service */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" /> Preço Base por Hora (R$)
              </CardTitle>
              <CardDescription className="mt-1.5">
                Valor cobrado por hora trabalhada para cada tipo de serviço.
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Serviço
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.length === 0 ? (
            <p className="text-muted-foreground">Nenhum serviço cadastrado.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((s) => (
                <div key={s.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Label htmlFor={`svc_${s.id}`} className="truncate font-medium">
                        {s.name}
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setDeleteTarget(s)}
                      aria-label={`Excluir ${s.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    id={`svc_${s.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={s.base_price ?? 0}
                    onChange={(e) => handleServicePriceChange(s.id, e.target.value)}
                  />
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSaveServices} disabled={savingServices}>
              {savingServices ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar preços por serviço
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Short-job dynamic pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-primary" /> Ajuste Dinâmico para Jobs Curtos
          </CardTitle>
          <CardDescription>
            Jobs curtos são menos atrativos para o profissional (mesmo custo de deslocamento, menor
            remuneração). Aplique uma sobretaxa por faixa de horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="min_hours">Mínimo de horas por serviço</Label>
              <Input
                id="min_hours"
                type="number"
                step="1"
                min="1"
                value={settings.min_hours}
                onChange={(e) => handleShortJobChange('min_hours', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nenhuma contratação pode ter menos horas que este valor. Padrão: 4h.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="normal_hours_threshold">Limite para preço normal (h+)</Label>
              <Input
                id="normal_hours_threshold"
                type="number"
                step="1"
                min="1"
                value={settings.normal_hours_threshold}
                onChange={(e) => handleShortJobChange('normal_hours_threshold', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A partir deste número de horas não há sobretaxa (multiplicador 1.0×). Padrão: 8h.
              </p>
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mult_4_5">Multiplicador para 4h–5h</Label>
              <Input
                id="mult_4_5"
                type="number"
                step="0.05"
                min="1"
                value={settings.short_job_multiplier_4_5}
                onChange={(e) => handleShortJobChange('short_job_multiplier_4_5', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ex.: 1.5× transforma R$ 45,00/h em R$ 67,50/h.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mult_6_7">Multiplicador para 6h–7h</Label>
              <Input
                id="mult_6_7"
                type="number"
                step="0.05"
                min="1"
                value={settings.short_job_multiplier_6_7}
                onChange={(e) => handleShortJobChange('short_job_multiplier_6_7', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ex.: 1.3× transforma R$ 45,00/h em R$ 58,50/h.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar ajuste de jobs curtos
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Travel / displacement fee and coverage center */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Área de Atendimento e Deslocamento
          </CardTitle>
          <CardDescription>
            Configure o centro geográfico da operação, o raio máximo de cobertura e a taxa fixa de
            deslocamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status do centro configurado */}
          {settings.service_center_lat != null && settings.service_center_lng != null ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-emerald-600" /> Centro configurado e bloqueio
                  ativo
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCenter}
                  className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                >
                  Limpar centro
                </Button>
              </div>
              <p className="text-xs text-emerald-800">
                <strong>Endereço:</strong> {settings.service_center_address || 'Coordenadas salvas'}
              </p>
              <p className="text-xs text-emerald-700 font-mono">
                Lat: {settings.service_center_lat.toFixed(6)}, Lng:{' '}
                {settings.service_center_lng.toFixed(6)} | Raio: {settings.service_radius_km} km
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Centro da área não configurado — bloqueio por raio inativo.</strong>
                <p className="text-amber-800 mt-0.5">
                  Informe o endereço central abaixo e clique em &quot;Localizar no mapa&quot; para
                  ativar a restrição geográfica de pedidos.
                </p>
              </div>
            </div>
          )}

          {/* Localização do centro */}
          <div className="space-y-2 rounded-lg border bg-slate-50/50 p-4">
            <Label htmlFor="center_address">Endereço do centro da área de atendimento</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="center_address"
                placeholder="Ex.: Centro de Campinas, SP ou Praça da Sé, São Paulo"
                value={centerAddressInput}
                onChange={(e) => setCenterAddressInput(e.target.value)}
                className="bg-white flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleGeocodeCenter}
                disabled={geocodingCenter}
                className="shrink-0"
              >
                {geocodingCenter ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Localizando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" /> Localizar no mapa
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Usa o proxy do Google Maps para obter latitude e longitude precisas sem expor a chave
              de API.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="flat_travel_fee">Taxa fixa de deslocamento (R$)</Label>
              <Input
                id="flat_travel_fee"
                type="number"
                step="0.01"
                min="0"
                value={settings.flat_travel_fee}
                onChange={(e) => handleNumberChange('flat_travel_fee', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Valor fixo cobrado pelo deslocamento em todas as solicitações dentro do raio.
                Padrão: R$ 10,00.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_radius_km">Raio de atendimento (km)</Label>
              <Input
                id="service_radius_km"
                type="number"
                step="1"
                min="1"
                value={settings.service_radius_km}
                onChange={(e) => handleNumberChange('service_radius_km', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Distância máxima em km a partir do centro de atendimento. Padrão: 15 km.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar área e deslocamento
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Demand factors + base price per hour */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" /> Precificação Dinâmica
          </CardTitle>
          <CardDescription>
            Fatores multiplicadores por nível de demanda. 1.0 = preço base.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { key: 'low', label: 'Baixa demanda' },
              { key: 'medium', label: 'Média demanda' },
              { key: 'high', label: 'Alta demanda' },
              { key: 'peak', label: 'Pico' },
            ].map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={`factor_${f.key}`}>{f.label}</Label>
                <Input
                  id={`factor_${f.key}`}
                  type="number"
                  step="0.05"
                  min="0"
                  value={settings.demand_factors?.[f.key] ?? 1}
                  onChange={(e) => handleFactorChange(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price_per_hour" className="flex items-center gap-1">
                <Gauge className="h-4 w-4" /> Preço base por hora (R$)
              </Label>
              <Input
                id="price_per_hour"
                type="number"
                step="0.01"
                min="0"
                value={settings.price_per_hour}
                onChange={(e) => handleNumberChange('price_per_hour', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Valor base da mão de obra por hora, usado como referência geral.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar preços dinâmicos
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pagamento em Modo Demo (Alteração 2) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Modo de Pagamento em Produção / Teste
          </CardTitle>
          <CardDescription>
            Controle se o checkout permite pagamentos simulados quando as credenciais do Mercado
            Pago não estiverem disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="payments_demo_switch" className="text-base font-medium">
                Permitir modo demo de pagamento (sem cobrança real)
              </Label>
              <p className="text-xs text-muted-foreground">
                Quando desligado (recomendado em produção), o checkout bloqueia a criação de
                serviços caso as credenciais reais do Mercado Pago estejam ausentes, exibindo aviso
                de indisponibilidade. Quando ligado, exibe formulário simulado para testes.
              </p>
            </div>
            <Switch
              id="payments_demo_switch"
              checked={!!settings.payments_demo_enabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, payments_demo_enabled: checked }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar modo de pagamento
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Margins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Margens por Tipo de Serviço
          </CardTitle>
          <CardDescription>
            Acréscimos percentuais aplicados sobre o preço base conforme o tipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="emergency_margin">Margem para serviços emergenciais (%)</Label>
            <Input
              id="emergency_margin"
              type="number"
              step="0.1"
              min="0"
              value={settings.emergency_margin_percent}
              onChange={(e) => handleNumberChange('emergency_margin_percent', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Acréscimo aplicado sobre serviços sob demanda (tipo Uber).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_margin">Margem para serviços agendados (%)</Label>
            <Input
              id="scheduled_margin"
              type="number"
              step="0.1"
              min="0"
              value={settings.scheduled_margin_percent}
              onChange={(e) => handleNumberChange('scheduled_margin_percent', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Acréscimo aplicado sobre serviços agendados.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Create service dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Adicionar Serviço
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo tipo de serviço oferecido pela plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="svc_name">Nome *</Label>
              <Input
                id="svc_name"
                placeholder="Ex.: Faxineira"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc_desc">Descrição</Label>
              <Input
                id="svc_desc"
                placeholder="Breve descrição do serviço"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc_price">Preço base/hora (R$) *</Label>
              <Input
                id="svc_price"
                type="number"
                step="0.01"
                min="0"
                placeholder="25.00"
                value={form.base_price}
                onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...
                </>
              ) : (
                'Criar serviço'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o serviço <strong>{deleteTarget?.name}</strong>? Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
