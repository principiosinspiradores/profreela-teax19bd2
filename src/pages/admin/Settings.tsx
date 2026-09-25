import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2,
  Save,
  Percent,
  Clock,
  ToggleLeft,
  SlidersHorizontal,
  ShieldCheck,
  Ban,
} from 'lucide-react'
import {
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
  type PlatformSettings,
} from '@/services/settings'
import {
  getCancellationPolicy,
  updateCancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from '@/services/cancellation'

export default function AdminSettings() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)
  const [policy, setPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), getCancellationPolicy()])
      .then(([s, p]) => {
        setSettings(s)
        setPolicy(p)
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

  const handleToggle = (key: keyof PlatformSettings, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const handlePolicyNumberChange = (key: keyof CancellationPolicy, value: string) => {
    const num = value === '' ? 0 : parseFloat(value)
    setPolicy((p) => ({ ...p, [key]: isNaN(num) ? 0 : num }))
  }

  const handleSavePolicy = async () => {
    setSavingPolicy(true)
    try {
      const updated = await updateCancellationPolicy({ ...policy })
      setPolicy(updated)
      toast({
        title: 'Política de cancelamento salva',
        description: 'As regras de cancelamento foram atualizadas com sucesso.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar a política de cancelamento.',
        variant: 'destructive',
      })
    } finally {
      setSavingPolicy(false)
    }
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
        payments_demo_enabled: settings.payments_demo_enabled,
        guarantee_period_days: settings.guarantee_period_days,
        clock_in_deadline_hours: settings.clock_in_deadline_hours,
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

      {/* Escrow / guarantee */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Pagamento com Garantia (Escrow)
          </CardTitle>
          <CardDescription>
            Configure o fluxo de pré-autorização (captura diferida) e o período de garantia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guarantee_days">Período de garantia (dias)</Label>
            <Input
              id="guarantee_days"
              type="number"
              step="1"
              min="0"
              value={settings.guarantee_period_days}
              onChange={(e) => handleNumberChange('guarantee_period_days', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Tempo que o pagamento fica retido após a conclusão do serviço antes da captura
              definitiva. Padrão: 7 dias.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clock_in_hours">Prazo para clock-in (horas)</Label>
            <Input
              id="clock_in_hours"
              type="number"
              step="1"
              min="1"
              value={settings.clock_in_deadline_hours}
              onChange={(e) => handleNumberChange('clock_in_deadline_hours', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Após esse prazo sem clock-in do profissional, a pré-autorização é cancelada
              automaticamente. Padrão: 24h.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cancellation policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-primary" /> Política de Cancelamento
          </CardTitle>
          <CardDescription>
            Regras assimétricas (estilo Uber) para cliente e profissional. Os valores padrão já vêm
            preenchidos conforme a política da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Client rules */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Cliente</h4>
              <span className="text-xs text-muted-foreground">
                Multa proporcional ao valor do serviço — 50% plataforma / 50% profissional.
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="client_grace" className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Carência gratuita (horas)
                </Label>
                <Input
                  id="client_grace"
                  type="number"
                  step="0.5"
                  min="0"
                  value={policy.client_grace_hours}
                  onChange={(e) => handlePolicyNumberChange('client_grace_hours', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cancelamento grátis dentro desse prazo após confirmar. Padrão: 2h.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_pct_over_24">Multa &gt; 24h antes (%)</Label>
                <Input
                  id="client_pct_over_24"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={policy.client_pct_over_24h}
                  onChange={(e) => handlePolicyNumberChange('client_pct_over_24h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: 10%.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_pct_4_24">Multa entre 4h e 24h (%)</Label>
                <Input
                  id="client_pct_4_24"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={policy.client_pct_4_to_24h}
                  onChange={(e) => handlePolicyNumberChange('client_pct_4_to_24h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: 30%.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_pct_under_4">Multa &lt; 4h antes (%)</Label>
                <Input
                  id="client_pct_under_4"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={policy.client_pct_under_4h}
                  onChange={(e) => handlePolicyNumberChange('client_pct_under_4h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: 50%.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_pro_share">Repasse ao profissional (%)</Label>
                <Input
                  id="client_pro_share"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={policy.client_pro_share_pct}
                  onChange={(e) => handlePolicyNumberChange('client_pro_share_pct', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Percentual da multa destinado ao profissional (compensação). Padrão: 50%.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Professional rules */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Profissional</h4>
              <span className="text-xs text-muted-foreground">
                Taxas fixas — 100% para a plataforma. Reincidência gera suspensão automática.
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pro_grace" className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Carência gratuita (horas)
                </Label>
                <Input
                  id="pro_grace"
                  type="number"
                  step="0.5"
                  min="0"
                  value={policy.pro_grace_hours}
                  onChange={(e) => handlePolicyNumberChange('pro_grace_hours', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cancelamento grátis dentro desse prazo após aceitar. Padrão: 1h.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro_fee_over_24">Taxa &gt; 24h antes (R$)</Label>
                <Input
                  id="pro_fee_over_24"
                  type="number"
                  step="0.01"
                  min="0"
                  value={policy.pro_fee_over_24h}
                  onChange={(e) => handlePolicyNumberChange('pro_fee_over_24h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: R$ 25,00.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro_fee_4_24">Taxa entre 4h e 24h (R$)</Label>
                <Input
                  id="pro_fee_4_24"
                  type="number"
                  step="0.01"
                  min="0"
                  value={policy.pro_fee_4_to_24h}
                  onChange={(e) => handlePolicyNumberChange('pro_fee_4_to_24h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: R$ 50,00.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro_fee_under_4">Taxa &lt; 4h antes (R$)</Label>
                <Input
                  id="pro_fee_under_4"
                  type="number"
                  step="0.01"
                  min="0"
                  value={policy.pro_fee_under_4h}
                  onChange={(e) => handlePolicyNumberChange('pro_fee_under_4h', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Padrão: R$ 80,00.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro_monthly_limit">Limite de reincidência (mês)</Label>
                <Input
                  id="pro_monthly_limit"
                  type="number"
                  step="1"
                  min="1"
                  value={policy.pro_monthly_limit}
                  onChange={(e) => handlePolicyNumberChange('pro_monthly_limit', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cancelamentos no mês que ativam a suspensão automática. Padrão: 3.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSavePolicy} disabled={savingPolicy} size="lg">
              {savingPolicy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Salvar Política
                </>
              )}
            </Button>
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
            {
              key: 'payments_demo_enabled' as const,
              label: 'Modo demo de pagamento',
              desc: 'Permitir checkout simulado caso o gateway de pagamento esteja sem credenciais ativas.',
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
