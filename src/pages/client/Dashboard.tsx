import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusCircle,
  Clock,
  Shield,
  MapPin,
  AlertTriangle,
  Ban,
  Star,
  Users,
  Phone,
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
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getClientJobs, getBanners, getNearbyPros } from '@/services/api'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { getAvatarUrl } from '@/lib/avatar'
import { BrandLogo } from '@/components/BrandLogo'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'
import { DisputeDialog } from '@/components/DisputeDialog'
import { jobStatusLabel } from '@/lib/jobStatus'
import { type PaymentState } from '@/services/checkout'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import {
  getCancellationPolicy,
  cancelJob,
  previewPenalty,
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
} from '@/services/cancellation'
import { getReviewsByAuthor } from '@/services/reviews'
import { ReviewDialog } from '@/components/ReviewDialog'
import { formatScheduledSlot } from '@/lib/scheduling'
import { useUnreadMessages } from '@/hooks/use-unread-messages'
import { MessageCircle } from 'lucide-react'
import { getProPhoneForClient, canClientViewRealPhone } from '@/lib/phone'
import { ProDelayDialog } from '@/components/ProDelayDialog'
// `Link` is already imported from react-router-dom at the top of this file.

export default function ClientDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const stats = useDashboardStats(user?.id)
  const unreadMessages = useUnreadMessages()
  const [jobs, setJobs] = useState<any[]>([])
  const [banners, setBanners] = useState<any[]>([])
  const [pros, setPros] = useState<any[]>([])

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

  // Jobs where the professional is +15 min late and the client must answer
  // (cron arms `delay_notification_sent`; the client decides via ProDelayDialog).
  const pendingDelayJobs = jobs.filter(
    (j) =>
      j.status === 'accepted' &&
      j.delay_notification_sent === true &&
      !j.client_delay_response &&
      !j.extended,
  )

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
          <h1 className="text-3xl font-bold tracking-tight">Painel do Cliente</h1>
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

      {/* Professionals availability summary card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Profissionais Disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Available professionals */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="bg-primary/10 p-2.5 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Disponíveis</p>
                  <p className="text-lg font-bold text-primary">
                    {stats.error ? '--' : (stats.data?.availableCount ?? 0)}
                  </p>
                </div>
              </div>

              {/* Top rated */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="bg-amber-100 p-2.5 rounded-lg">
                  <Star className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Melhor avaliado</p>
                  <p className="text-lg font-bold truncate">
                    {stats.error || !stats.data?.topRated
                      ? '--'
                      : `${stats.data.topRated.name} (${stats.data.topRated.rating
                          .toFixed(1)
                          .replace('.', ',')})`}
                  </p>
                </div>
              </div>

              {/* Avg response time */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="bg-primary/10 p-2.5 rounded-lg">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Tempo médio de resposta</p>
                  <p className="text-lg font-bold">
                    {stats.error ? '--' : `~${stats.data?.avgResponseMin ?? 5} min`}
                  </p>
                </div>
              </div>

              {/* Region coverage */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                <div className="bg-primary/10 p-2.5 rounded-lg">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Atendemos sua região</p>
                  <p className="text-lg font-bold truncate">
                    {stats.error ? (
                      '--'
                    ) : stats.data?.hasAddress ? (
                      stats.data.addressLabel || 'Sim'
                    ) : (
                      <Link to="/client/request" className="text-primary hover:underline">
                        Cadastre seu endereço
                      </Link>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/client/request">
              <PlusCircle className="mr-2 h-5 w-5" /> Solicitar Profissional
            </Link>
          </Button>
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
                  <div className="md:w-48 h-48 md:h-32 bg-muted relative flex items-center justify-center rounded-t-lg md:rounded-l-lg md:rounded-tr-none">
                    {job.expand?.pro_id ? (
                      <img
                        src={getAvatarUrl(job.expand.pro_id, 200)}
                        className="w-full h-full object-contain md:object-cover"
                        alt={job.expand.pro_id.name || 'Profissional'}
                      />
                    ) : (
                      <BrandLogo size="xl" />
                    )}
                    <Badge className="absolute top-2 right-2 bg-secondary capitalize">
                      {jobStatusLabel(job.status)}
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
                          {job.type === 'emergency'
                            ? 'Emergência'
                            : formatScheduledSlot(job.scheduled_at, job.hours)}
                        </p>
                      </div>
                    </div>
                    {job.payment_status && (
                      <div className="mt-2">
                        <PaymentStatusBadge state={job as PaymentState} role="client" />
                      </div>
                    )}
                    {job.expand?.pro_id || job.pro_id ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t">
                        <div className="flex items-center gap-3">
                          <img
                            src={getAvatarUrl(job.expand?.pro_id || { id: job.pro_id }, 128)}
                            className="w-8 h-8 rounded-full"
                            alt="Pro"
                          />
                          <div>
                            <span className="text-sm font-medium block">
                              {job.expand?.pro_id?.name || 'Profissional'}
                            </span>
                            {job.expand?.pro_id?.phone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {getProPhoneForClient(job.expand.pro_id.phone, job)}
                                {canClientViewRealPhone(job) && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1 border-green-300 text-green-700 bg-green-50"
                                  >
                                    Liberado
                                  </Badge>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(job.status === 'accepted' || job.status === 'in_progress') && (
                            <Button asChild variant="link" size="sm" className="h-auto py-0">
                              <Link to={`/chat/${job.id}`}>
                                <MessageCircle className="h-4 w-4 mr-1" />
                                {unreadMessages.counts[job.id] > 0
                                  ? `Mensagens (${unreadMessages.counts[job.id]})`
                                  : 'Enviar Mensagem'}
                              </Link>
                            </Button>
                          )}
                          {(job.status === 'pending' || job.status === 'accepted') &&
                            job.payment_status !== 'disputed' && (
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
                        {(job.status === 'accepted' || job.status === 'in_progress') && (
                          <Button asChild variant="link" size="sm" className="h-auto py-0">
                            <Link to={`/chat/${job.id}`}>
                              <MessageCircle className="h-4 w-4 mr-1" />
                              {unreadMessages.counts[job.id] > 0
                                ? `Mensagens (${unreadMessages.counts[job.id]})`
                                : 'Enviar Mensagem'}
                            </Link>
                          </Button>
                        )}
                        {(job.status === 'pending' || job.status === 'accepted') &&
                          job.payment_status !== 'disputed' && (
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
                    )}{' '}
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
                        {job.expand?.pro_id?.name || 'Profissional'}
                        {job.expand?.pro_id?.phone
                          ? ` · Tel: ${getProPhoneForClient(job.expand.pro_id.phone, job)}`
                          : ''}
                        {' · ' + job.address}
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

      {/* Professional-delay flow: the pro is +15 min late and the client must
          choose to extend the deadline (1h/2h) or cancel + reopen as emergency. */}
      <ProDelayDialog jobs={pendingDelayJobs} onResolved={loadData} />

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
                      O valor pago em garantia será reembolsado ou retido conforme a política.
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
