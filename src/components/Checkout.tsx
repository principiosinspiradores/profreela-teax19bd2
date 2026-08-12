import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
  /** Total amount to pre-authorize on the customer's card (in BRL). */
  amount: number
  /** Connected account id of the professional who receives the split. */
  proAccountId: string
  /** Optional job/service description sent to the gateway. */
  description?: string
  /** Optional job id — persisted on the payment record for tracking. */
  jobId?: string
  /** Called after a successful (or demo) pre-authorization. */
  onPaid?: (result: any) => void
}

/**
 * Reusable checkout interface with manual-capture (escrow) pre-authorization.
 *
 * The full amount is pre-authorized on the customer's card when the
 * professional accepts the request — it is NOT captured immediately. The
 * capture + platform-fee split happens only after a 7-day guarantee window
 * following service completion. If the pro never clocks in within 24h, the
 * authorization is cancelled automatically (auto-refund).
 */
export function Checkout({ amount, proAccountId, description, jobId, onPaid }: CheckoutProps) {
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
        proAccountId,
        description,
        jobId,
      })
      if (result?.ok || result?.id || result?.split) {
        toast({
          title: 'Pagamento pré-autorizado',
          description: result?.demo
            ? 'Pré-autorização simulada (modo demo). A cobrança ocorre após a garantia de 7 dias.'
            : 'Valor pré-autorizado no cartão. A cobrança ocorre 7 dias após a conclusão do serviço.',
        })
        onPaid?.(result)
      } else {
        toast({
          title: 'Erro no pagamento',
          description: result?.error || 'Não foi possível pré-autorizar o pagamento.',
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

  const guaranteeDays = settings?.guarantee_period_days ?? 7

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
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Pré-autorização (escrow).</strong> O valor é reservado no seu cartão,{' '}
            <strong>não cobrado imediatamente</strong>. A cobrança só acontece {guaranteeDays} dias
            após a conclusão do serviço. Se o profissional não iniciar o atendimento em{' '}
            {settings?.clock_in_deadline_hours ?? 24}h, a pré-autorização é cancelada
            automaticamente.
          </div>
        </div>

        {/* Split summary */}
        {split && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total pré-autorizado</span>
              <span className="font-bold">
                R$ {split.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa da plataforma ({split.feePercent}%)</span>
              <span>
                - R$ {split.platformFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Repassa ao profissional</span>
              <span className="text-green-600">
                R$ {split.proAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Pré-autorizando...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Pré-autorizar R${' '}
              {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
          <Clock className="h-3 w-3" /> Cobrança efetivada apenas após {guaranteeDays} dias de
          garantia. A plataforma retém a taxa de serviço na captura.
        </p>
      </CardContent>
    </Card>
  )
}

export default Checkout
