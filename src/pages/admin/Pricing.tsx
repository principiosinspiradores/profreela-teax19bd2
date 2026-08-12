import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, SlidersHorizontal, Wrench, TrendingUp, Gauge } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from '@/services/settings'
import { getServices, updateService } from '@/services/api'

export default function AdminPricing() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingServices, setSavingServices] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), getServices()])
      .then(([s, svc]) => {
        setSettings(s)
        setServices(svc)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleNumberChange = (key: keyof PlatformSettings, value: string) => {
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
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" /> Preço Base por Hora (R$)
          </CardTitle>
          <CardDescription>
            Valor cobrado por hora trabalhada para cada tipo de serviço.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.length === 0 ? (
            <p className="text-muted-foreground">Nenhum serviço cadastrado.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((s) => (
                <div key={s.id} className="space-y-2">
                  <Label htmlFor={`svc_${s.id}`}>{s.name}</Label>
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
    </div>
  )
}
