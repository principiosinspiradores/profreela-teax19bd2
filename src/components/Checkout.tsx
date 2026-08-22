import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CreditCard, ShieldCheck, Lock, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  getCheckoutPreview,
  createSplitPayment,
  type PaymentConfig,
  type PaymentSplit,
} from '@/services/checkout'
import type { PlatformSettings } from '@/services/settings'

export interface CheckoutProps {
  /** Total amount to capture + hold in escrow on the customer's card (in BRL). */
  amount: number
  /**
   * Connected account id of the professional who receives the split. Optional
   * in the pay-at-request flow: the client pays before any pro has accepted, so
   * the split destination may not be known yet (finalized at release time).
   */
  proAccountId?: string
  /** Optional job/service description sent to the gateway. */
  description?: string
  /** Optional job id — persisted on the payment record for tracking. */
  jobId?: string
  /** Called after a successful (or demo) capture+hold. */
  onPaid?: (result: any) => void
  /** Optional label for the confirm button (defaults to "Pagar e solicitar"). */
  confirmLabel?: string
}

/**
 * Reusable checkout interface for the "pay at request" (escrow) flow.
 *
 * The full amount is captured + held in escrow by the platform when the client
 * confirms the payment — it IS charged immediately, not merely pre-authorized.
 * The platform-fee split is applied and the held amount is released to the
 * professional 24h after the service is completed. If the job is cancelled
 * before release, the held amount is refunded to the client.
 */
export function Checkout({
  amount,
  proAccountId,
  description,
  jobId,
  onPaid,
  confirmLabel,
}: CheckoutProps) {
  const { toast } = useToast()
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [split, setSplit] = useState<PaymentSplit | null>(null)
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' })

  useEffect(() => {
    let cancelled = false
    getCheckoutPreview(amount)
      .then(({ settings, config, split }) => {
        if (cancelled) return
        setSettings(settings)
        setConfig(config)
        setSplit(split)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [amount])

  const handlePay = async () => {
    setPaying(true)
    try {
      const result = await createSplitPayment({
        amount,
        proAccountId: proAccountId || '',
        description,
        jobId,
      })
      if (result?.ok || result?.id || result?.split) {
        toast({
          title: 'Pagamento confirmado',
          description: result?.demo
            ? 'Pagamento simulado (modo demo). O valor fica em garantia e é liberado ao profissional 24h após a conclusão.'
            : 'Valor pago e mantido em garantia pela plataforma. Será liberado ao profissional 24h após a conclusão do serviço.',
        })
        onPaid?.(result)
      } else {
        toast({
          title: 'Erro no pagamento',
          description: result?.error || 'Não foi possível processar o pagamento.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro no pagamento',
        description: err?.message || 'Falha inesperada.',
        variant: 'destructive',
      })
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Preparando checkout...
      </div>
    )
  }

  const providerLabel =
    config?.provider === 'stripe'
      ? 'Stripe'
      : config?.provider === 'mercadopago'
        ? 'Mercado Pago'
        : 'Modo demo'

  const guaranteeDays = settings?.guarantee_period_days ?? 1

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" /> Pagamento
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Badge variant="secondary">{providerLabel}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Pagamento com garantia
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Escrow notice */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex gap-2">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Pagamento em garantia (escrow).</strong> O valor é cobrado agora e mantido pela
            plataforma. O profissional só recebe após a conclusão do serviço, com uma garantia de{' '}
            {guaranteeDays === 1 ? '24h' : `${guaranteeDays} dias`} para contestação. Se o serviço
            for cancelado antes da conclusão, o valor é reembolsado automaticamente.
          </div>
        </div>

        {/* Total */}
        {split && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total a pagar</span>
              <span className="font-bold">
                R$ {split.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {settings?.module_dynamic_pricing_enabled && (
              <p className="text-xs text-muted-foreground pt-1">
                Precificação dinâmica ativa — fatores de demanda aplicados.
              </p>
            )}
          </div>
        )}

        {/* Card form (collects data for the gateway SDK; demo-only here) */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="card-name">Nome no cartão</Label>
            <Input
              id="card-name"
              placeholder="Nome completo"
              value={card.name}
              onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-number">Número do cartão</Label>
            <Input
              id="card-number"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={card.number}
              onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="card-expiry">Validade</Label>
              <Input
                id="card-expiry"
                placeholder="MM/AA"
                value={card.expiry}
                onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-cvc">CVC</Label>
              <Input
                id="card-cvc"
                inputMode="numeric"
                placeholder="123"
                value={card.cvc}
                onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <Button className="w-full h-12 text-base" onClick={handlePay} disabled={paying}>
          {paying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> {confirmLabel || 'Pagar e solicitar'} R${' '}
              {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" /> Valor liberado ao profissional{' '}
          {guaranteeDays === 1 ? '24h' : `${guaranteeDays} dias`} após a conclusão do serviço.
        </p>
      </CardContent>
    </Card>
  )
}

export default Checkout
