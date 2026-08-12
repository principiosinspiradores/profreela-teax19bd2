import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Save, Percent, Clock, ToggleLeft, SlidersHorizontal } from 'lucide-react'
import {
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from '@/services/settings'

export default function AdminSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then(setSettings)
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

  const handleToggle = (key: keyof PlatformSettings, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateSettings({
        service_fee_percent: settings.service_fee_percent,
        emergency_margin_percent: settings.emergency_margin_percent,
        scheduled_margin_percent: settings.scheduled_margin_percent,
        demand_factors: settings.demand_factors,
        price_per_hour: settings.price_per_hour,
        min_service_fee: settings.min_service_fee,
        module_chat_enabled: settings.module_chat_enabled,
        module_reviews_enabled: settings.module_reviews_enabled,
        module_referrals_enabled: settings.module_referrals_enabled,
        module_dynamic_pricing_enabled: settings.module_dynamic_pricing_enabled,
      })
      setSettings(updated)
      toast({
        title: 'Configurações salvas',
        description: 'As regras de negócio foram atualizadas com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando configurações...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie as regras de negócio e módulos da plataforma.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Salvar alterações
            </>
          )}
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Atenção:</strong> chaves sensíveis (Google Maps, Stripe, Mercado Pago) são
        gerenciadas exclusivamente nas variáveis de ambiente do servidor e não aparecem aqui.
      </div>

      {/* Pricing & fees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Taxas e Precificação
          </CardTitle>
          <CardDescription>
            Defina a taxa da plataforma e as margens aplicadas a cada tipo de serviço.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service_fee">Taxa de serviço da plataforma (%)</Label>
            <Input
              id="service_fee"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={settings.service_fee_percent}
              onChange={(e) => handleNumberChange('service_fee_percent', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Percentual retido pela plataforma em cada transação.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min_fee">Taxa mínima (R$)</Label>
            <Input
              id="min_fee"
              type="number"
              step="0.01"
              min="0"
              value={settings.min_service_fee}
              onChange={(e) => handleNumberChange('min_service_fee', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Piso da taxa para serviços pequenos.</p>
          </div>
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

      {/* Dynamic pricing */}
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
                <Clock className="h-4 w-4" /> Preço por hora (R$)
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
                Valor cobrado por hora trabalhada para precificação base da mão de obra.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-primary" /> Módulos da Plataforma
          </CardTitle>
          <CardDescription>
            Ative ou desative funcionalidades da plataforma em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {[
            {
              key: 'module_chat_enabled' as const,
              label: 'Chat',
              desc: 'Comunicação entre cliente e profissional dentro da plataforma.',
            },
            {
              key: 'module_reviews_enabled' as const,
              label: 'Avaliações',
              desc: 'Sistema de avaliação após a conclusão de serviços.',
            },
            {
              key: 'module_referrals_enabled' as const,
              label: 'Indicações',
              desc: 'Programa de indicação de novos usuários e profissionais.',
            },
            {
              key: 'module_dynamic_pricing_enabled' as const,
              label: 'Precificação dinâmica',
              desc: 'Ajuste automático de preços conforme a demanda em tempo real.',
            },
          ].map((m) => (
            <div
              key={m.key}
              className="flex items-center justify-between py-4 border-b last:border-0"
            >
              <div className="pr-4">
                <p className="font-medium">{m.label}</p>
                <p className="text-sm text-muted-foreground">{m.desc}</p>
              </div>
              <Switch checked={!!settings[m.key]} onCheckedChange={(v) => handleToggle(m.key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Salvar alterações
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
