import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusCircle,
  Clock,
  Shield,
  MapPin,
  CreditCard,
  QrCode,
  AlertTriangle,
  Ban,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getClientJobs, getBanners, getNearbyPros, updateJob } from '@/services/api'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { getAvatarUrl } from '@/lib/avatar'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'
import { DisputeDialog } from '@/components/DisputeDialog'
import { createSplitPayment, releasePayment, type PaymentState } from '@/services/checkout'
import {
  getCancellationPolicy,
  cancelJob,
  previewPenalty,
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from '@/services/cancellation'
import { getReviewsByAuthor } from '@/services/reviews'
import { ReviewDialog } from '@/components/ReviewDialog'

/** A small emoji set for known service types, used as a fallback thumbnail. */
const SERVICE_EMOJI: Record<string, string> = {
  faxineira: '🧹',
  camareira: '🛏️',
  'auxiliar de serviços gerais': '🧽',
  'ajudante operacional': '📦',
}
function serviceEmoji(name?: string): string | null {
  if (!name) return null
  return SERVICE_EMOJI[name.toLowerCase().trim()] || null
}

export default function ClientDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [jobs, setJobs] = useState<any[]>([])
  const [banners, setBanners] = useState<any[]>([])
  const [pros, setPros] = useState<any[]>([])

  const [paymentJob, setPaymentJob] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState('credit_card')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [disputeJob, setDisputeJob] = useState<any>(null)

  const [cancelJobState, setCancelJobState] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [policy, setPolicy] = useState<CancellationPolicy>(DEFAULT_CANCELLATION_POLICY)
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set())
  const [reviewJob, setReviewJob] = useState<any>(null)

  useEffect(() => {
    getCancellationPolicy()
      .then(setPolicy)
      .catch(() => {})
  }, [])

  const loadData = async () => {
    if (!user) return
    const [j, b, p, reviews] = await Promise.all([
      getClientJobs(user.id),
      getBanners(),
      getNearbyPros(),
      getReviewsByAuthor(user.id).catch(() => []),
    ])
    setJobs(j)
    setBanners(b)
    setPros(p)
    setReviewedJobIds(new Set((reviews as any[]).map((r) => r.job_id)))
  }

  useEffect(() => {
    loadData()
  }, [user])
  useRealtime('jobs', loadData)

  const activeJobs = jobs.filter((j) => ['pending', 'accepted', 'in_progress'].includes(j.status))
  const completedJobs = jobs.filter((j) => j.status === 'completed')

  const handlePayment = async () => {
    if (!paymentJob) return
    setProcessingPayment(true)
    try {
      // Pre-authorize (manual capture) the amount on the customer's card.
      await createSplitPayment({
        amount: paymentJob.price,
        proAccountId: paymentJob.pro_id || paymentJob.expand?.pro_id?.id || '',
        description: paymentJob.expand?.service_id?.name || 'Serviço ProFreela',
        jobId: paymentJob.id,
      })
      // The amount is held, not captured. Service moves to in_progress.
      await updateJob(paymentJob.id, { status: 'in_progress' })
      toast({
        title: 'Pagamento pré-autorizado',
        description:
          'Valor reservado no cartão. A cobrança ocorre 7 dias após a conclusão do serviço.',
      })
      setPaymentJob(null)
      loadData()
    } catch (err) {
      toast({ title: 'Erro no pagamento', variant: 'destructive' })
    } finally {
      setProcessingPayment(false)
    }
  }

  const handleComplete = async (job: any) => {
    try {
      await updateJob(job.id, { status: 'completed', completed_at: new Date().toISOString() })
      await releasePayment(job.id)
      toast({
        title: 'Serviço concluído',
        description: 'Iniciado o período de garantia de 7 dias. O pagamento será liberado após.',
      })
      loadData()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível concluir.', variant: 'destructive' })
    }
  }

  const handleConfirmCancel = async () => {
    if (!cancelJobState) return
    setCancelling(true)
    try {
      const res = await cancelJob(cancelJobState.id, cancelReason)
      toast({
        title: res.suspended ? 'Serviço cancelado — profissional suspenso' : 'Serviço cancelado',
        description:
          res.penalty_amount > 0
            ? `${res.penalty_label}.`
            : 'Cancelamento gratuito realizado com sucesso.',
        variant: res.suspended ? 'destructive' : 'default',
      })
      setCancelJobState(null)
      setCancelReason('')
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao cancelar',
        description: err?.message || 'Não foi possível cancelar o serviço.',
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portal da Empresa</h1>
          <p className="text-muted-foreground">Gerencie suas solicitações e profissionais.</p>
        </div>
        <Button asChild size="lg" className="h-12 shadow-md">
          <Link to="/client/request">
            <PlusCircle className="mr-2 h-5 w-5" /> Solicitar Profissional
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary mb-1">Profissionais Ativos</p>
                <h3 className="text-3xl font-bold text-primary">{pros.length}</h3>
              </div>
              <div className="bg-white p-3 rounded-full shadow-sm">
                <Shield className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Agendamentos Futuros
                </p>
                <h3 className="text-3xl font-bold">
                  {jobs.filter((j) => j.status === 'pending').length}
                </h3>
              </div>
              <div className="bg-muted p-3 rounded-full">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map of Nearby Pros */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-slate-50 pb-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Profissionais Próximos (Google Maps)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-72 bg-slate-200 relative w-full">
            <img
              src="https://img.usecurling.com/p/1000/400?q=street%20map"
              alt="Google Maps Mock"
              className="w-full h-full object-cover opacity-60 mix-blend-multiply"
            />
            {pros.map((pro, i) => (
              <div
                key={pro.id}
                className="absolute flex flex-col items-center transform -translate-x-1/2 -translate-y-full transition-all duration-1000"
                style={{
                  top: `${40 + i * 15}%`,
                  left: `${30 + i * 20}%`,
                }}
              >
                <div className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full mb-1 shadow-sm font-bold whitespace-nowrap">
                  {pro.name?.split(' ')[0] || 'Pro'}
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-primary overflow-hidden shadow-lg bg-white">
                  <img src={getAvatarUrl(pro, 128)} className="w-full h-full object-cover" />
                </div>
                {Number(pro.rating_count) > 0 && (
                  <div className="bg-amber-400 text-white text-[10px] px-1.5 py-0.5 rounded-full -mt-1 shadow-sm font-bold flex items-center gap-0.5">
                    ★{' '}
                    {Number(pro.rating_avg || 0)
                      .toFixed(1)
                      .replace('.', ',')}
                  </div>
                )}
                <div className="w-2 h-2 bg-primary transform rotate-45 -mt-1 shadow-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Requests */}
      <div>
        <h2 className="text-xl font-bold mb-4">Serviços em Andamento</h2>
        {activeJobs.length === 0 ? (
          <p className="text-muted-foreground">Nenhum serviço em andamento.</p>
        ) : (
          <div className="grid gap-4">
            {activeJobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-0 flex flex-col md:flex-row">
                  <div className="md:w-48 h-32 bg-muted relative flex items-center justify-center">
                    {job.expand?.pro_id ? (
                      <img
                        src={getAvatarUrl(job.expand.pro_id, 200)}
                        className="w-full h-full object-cover"
                        alt={job.expand.pro_id.name || 'Profissional'}
                      />
                    ) : (
                      <span className="text-5xl" aria-hidden>
                        {serviceEmoji(job.expand?.service_id?.name) || '🧰'}
                      </span>
                    )}
                    <Badge className="absolute top-2 right-2 bg-secondary capitalize">
                      {job.status}
                    </Badge>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-lg">
                          {job.expand?.service_id?.name || 'Serviço'}
                        </h3>
                        <p className="text-sm text-muted-foreground">{job.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">R$ {job.price?.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.type === 'emergency' ? 'Emergência' : 'Agendado'}
                        </p>
                      </div>
                    </div>
                    {job.payment_status && (
                      <div className="mt-2">
                        <PaymentStatusBadge state={job as PaymentState} />
                      </div>
                    )}
                    {job.expand?.pro_id || job.pro_id ? (
                      <div className="flex items-center gap-3 mt-4 pt-4 border-t">
                        <img
                          src={getAvatarUrl(job.expand?.pro_id || { id: job.pro_id }, 128)}
                          className="w-8 h-8 rounded-full"
                          alt="Pro"
                        />
                        <span className="text-sm font-medium">
                          {job.expand?.pro_id?.name || 'Profissional'}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          {job.status === 'accepted' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => setPaymentJob(job)}
                            >
                              Pré-autorizar
                            </Button>
                          )}
                          {job.status === 'in_progress' && (
                            <Button size="sm" variant="default" onClick={() => handleComplete(job)}>
                              Concluir Serviço
                            </Button>
                          )}
                          {job.status === 'accepted' && (
                            <Button variant="link" size="sm" className="h-auto py-0">
                              Enviar Mensagem
                            </Button>
                          )}
                          {(job.status === 'pending' || job.status === 'accepted') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => {
                                setCancelJobState(job)
                                setCancelReason('')
                              }}
                            >
                              <Ban className="h-4 w-4 mr-1" /> Cancelar Serviço
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                        {job.status === 'accepted' && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => setPaymentJob(job)}
                          >
                            Pré-autorizar
                          </Button>
                        )}
                        {(job.status === 'pending' || job.status === 'accepted') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-300 hover:bg-red-50"
                            onClick={() => {
                              setCancelJobState(job)
                              setCancelReason('')
                            }}
                          >
                            <Ban className="h-4 w-4 mr-1" /> Cancelar Serviço
                          </Button>
                        )}
                      </div>
                    )}
                    {job.payment_status === 'held' && (
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-700 border-amber-300"
                          onClick={() => setDisputeJob(job)}
                        >
                          <AlertTriangle className="h-4 w-4 mr-1" /> Reportar Problema
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <Dialog open={!!paymentJob} onOpenChange={(o) => !o && setPaymentJob(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento Seguro</DialogTitle>
            <DialogDescription>
              O valor é <strong>pré-autorizado</strong> (escrow): reservado no cartão, sem cobrança
              imediata. A captura acontece 7 dias após a conclusão do serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl">
              <span className="font-medium text-muted-foreground">Valor Pré-autorizado</span>
              <span className="text-2xl font-bold text-primary">
                R$ {paymentJob?.price?.toFixed(2)}
              </span>
            </div>

            <div className="space-y-3">
              <Label>Método de Pagamento</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                className="grid grid-cols-2 gap-4"
              >
                <Label
                  htmlFor="cc"
                  className="flex flex-col items-center justify-center border-2 rounded-xl p-4 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary transition-all"
                >
                  <RadioGroupItem value="credit_card" id="cc" className="sr-only" />
                  <CreditCard className="h-6 w-6 mb-2 text-primary" />
                  <span className="text-sm font-medium">Cartão de Crédito</span>
                </Label>
                <Label
                  htmlFor="pix"
                  className="flex flex-col items-center justify-center border-2 rounded-xl p-4 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary transition-all"
                >
                  <RadioGroupItem value="pix" id="pix" className="sr-only" />
                  <QrCode className="h-6 w-6 mb-2 text-primary" />
                  <span className="text-sm font-medium">Pix</span>
                </Label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentJob(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePayment} disabled={processingPayment}>
              {processingPayment ? 'Pré-autorizando...' : 'Pré-autorizar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DisputeDialog
        jobId={disputeJob?.id ?? null}
        open={!!disputeJob}
        onOpenChange={(o) => !o && setDisputeJob(null)}
        onDisputed={loadData}
      />

      {/* Completed services — review CTA */}
      <div>
        <h2 className="text-xl font-bold mb-4">Serviços Concluídos</h2>
        {completedJobs.length === 0 ? (
          <p className="text-muted-foreground">Nenhum serviço concluído ainda.</p>
        ) : (
          <div className="grid gap-4">
            {completedJobs.map((job) => {
              const reviewed = reviewedJobIds.has(job.id)
              const hasPro = !!(job.expand?.pro_id || job.pro_id)
              return (
                <Card key={job.id}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{job.expand?.service_id?.name || 'Serviço'}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {job.expand?.pro_id?.name || 'Profissional'} · {job.address}
                      </p>
                    </div>
                    {hasPro && (
                      <Button
                        size="sm"
                        variant={reviewed ? 'outline' : 'default'}
                        disabled={reviewed}
                        onClick={() => setReviewJob(job)}
                      >
                        <Star className="h-4 w-4 mr-1" />
                        {reviewed ? 'Avaliado' : 'Avalie o Profissional'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <ReviewDialog
        job={reviewJob}
        open={!!reviewJob}
        onOpenChange={(o) => !o && setReviewJob(null)}
        onReviewed={loadData}
      />

      {/* Cancellation modal */}
      <Dialog
        open={!!cancelJobState}
        onOpenChange={(o) => {
          if (!o) {
            setCancelJobState(null)
            setCancelReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Serviço</DialogTitle>
            <DialogDescription>
              Confirme o cancelamento do serviço{' '}
              <strong>{cancelJobState?.expand?.service_id?.name || ''}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {(() => {
              if (!cancelJobState) return null
              const preview = previewPenalty('client', cancelJobState, policy)
              return (
                <div
                  className={
                    'p-4 rounded-xl border ' +
                    (preview.free
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800')
                  }
                >
                  <p className="font-medium">
                    {preview.free ? 'Cancelamento gratuito' : preview.label}
                  </p>
                  {!preview.free && (
                    <p className="text-sm mt-1">
                      O valor será deduzido da pré-autorização no cartão ou cobrado via Pix.
                    </p>
                  )}
                </div>
              )
            })()}
            <div className="space-y-2">
              <Label htmlFor="cancel_reason">Motivo do cancelamento (opcional)</Label>
              <Textarea
                id="cancel_reason"
                placeholder="Informe o motivo, se desejar..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelJobState(null)
                setCancelReason('')
              }}
              disabled={cancelling}
            >
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={cancelling}>
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelando...
                </>
              ) : (
                'Confirmar Cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
