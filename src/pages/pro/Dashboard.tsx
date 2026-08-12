import { useState, useEffect } from 'react'
import { MapPin, Navigation, Clock, AlertCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { getProJobs, updateJob, getUserDocuments, createDocument } from '@/services/api'
import { getSettings, DEFAULT_SETTINGS, type PlatformSettings } from '@/services/settings'
import { getHourMultiplier, shortJobBand } from '@/lib/pricing'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'
import {
  cancelAuthorization,
  guaranteeRemainingMs,
  formatGuaranteeCountdown,
  type PaymentState,
} from '@/services/checkout'

export default function ProDashboard() {
  const [isOnline, setIsOnline] = useState(false)
  const [pendingJob, setPendingJob] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [completedJobs, setCompletedJobs] = useState<any[]>([])
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)

  const loadData = async () => {
    if (!user) return
    getSettings()
      .then(setSettings)
      .catch(() => {})
    const docs = await getUserDocuments(user.id)
    setDocuments(docs)

    const jobs = await getProJobs(user.id)
    const pending = jobs.find((j) => j.status === 'pending')
    if (pending && pending.id !== pendingJob?.id) {
      setPendingJob(pending)
    }
    setCompletedJobs(
      jobs.filter(
        (j) =>
          j.pro_id === user.id &&
          ['completed'].includes(j.status) &&
          ['held', 'disputed', 'authorized'].includes(j.payment_status || ''),
      ),
    )
  }

  // tick for live countdown
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const handleCancelMissed = async (jobId: string) => {
    try {
      await cancelAuthorization(jobId)
      toast({ title: 'Pré-autorização cancelada', description: 'O serviço foi cancelado.' })
      loadData()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível cancelar.', variant: 'destructive' })
    }
  }

  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    loadData()
  }, [user, isOnline])

  useRealtime('jobs', loadData, isOnline)
  useRealtime('documents', loadData)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('user_id', user.id)
      formData.append('type', 'identity')
      formData.append('status', 'pending')
      formData.append('file', e.target.files[0])
      await createDocument(formData)
      toast({ title: 'Enviado', description: 'Documento em análise pela equipe.' })
      loadData()
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao enviar.', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const acceptJob = async () => {
    if (!pendingJob) return
    try {
      await updateJob(pendingJob.id, {
        status: 'accepted',
        pro_id: user?.id,
        accepted_at: new Date().toISOString(),
      })
      setPendingJob(null)
      navigate(`/pro/job/${pendingJob.id}`)
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível aceitar a solicitação.',
        variant: 'destructive',
      })
    }
  }

  if (user?.status === 'pending') {
    return (
      <div className="max-w-md mx-auto mt-10 space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Conta em Análise</AlertTitle>
          <AlertDescription>
            Sua conta está aguardando a verificação de documentos. Envie seu RG ou CNH.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Envio de Documentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label>Documento de Identidade (Imagem/PDF)</Label>
            <Input type="file" accept="image/*,.pdf" onChange={handleUpload} disabled={uploading} />
            {documents.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium flex justify-between">
                  Status atual:
                  <span
                    className={cn(
                      'px-2 rounded',
                      documents[0].status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800',
                    )}
                  >
                    {documents[0].status === 'pending' ? 'Em análise' : 'Rejeitado'}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative rounded-xl overflow-hidden border">
      {/* Fake Map Background */}
      <div className="absolute inset-0 bg-slate-100 z-0">
        <img
          src="https://img.usecurling.com/p/1200/800?q=street%20map&color=gray&dpr=2"
          alt="Google Maps Mock"
          className="w-full h-full object-cover opacity-60 mix-blend-multiply"
        />
        {/* Current Location Marker */}
        {isOnline && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="w-6 h-6 bg-secondary rounded-full border-4 border-white shadow-lg z-10" />
            <div className="absolute w-16 h-16 bg-secondary/30 rounded-full animate-pulse-ring" />
          </div>
        )}
      </div>

      {/* Top Status Bar */}
      <div className="relative z-10 m-4 flex justify-between items-center bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-sm border border-white/50">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-3 h-3 rounded-full transition-colors duration-500',
              isOnline ? 'bg-secondary shadow-[0_0_10px_rgba(0,200,83,0.8)]' : 'bg-slate-300',
            )}
          />
          <span className="font-semibold text-lg">
            {isOnline ? 'Você está Online' : 'Você está Offline'}
          </span>
        </div>
        <Switch
          checked={isOnline}
          onCheckedChange={setIsOnline}
          className="scale-125 origin-right data-[state=checked]:bg-secondary"
        />
      </div>

      {/* Bottom Info Card */}
      <div className="relative z-10 mt-auto m-4 space-y-3">
        {completedJobs.length > 0 && (
          <Card className="shadow-xl border-white/50 bg-white/95 backdrop-blur">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">Pagamentos em garantia</p>
              </div>
              {completedJobs.map((job) => {
                const remaining = guaranteeRemainingMs(job as PaymentState)
                return (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {job.expand?.service_id?.name || 'Serviço'}
                      </p>
                      <PaymentStatusBadge state={job as PaymentState} />
                    </div>
                    <div className="text-right">
                      {job.payment_status === 'held' && remaining > 0 ? (
                        <p className="text-xs text-amber-700">
                          Seu pagamento será liberado em{' '}
                          <strong>{formatGuaranteeCountdown(remaining)}</strong>
                        </p>
                      ) : job.payment_status === 'held' ? (
                        <p className="text-xs text-green-700">Pronto para captura</p>
                      ) : job.payment_status === 'disputed' ? (
                        <p className="text-xs text-red-700">Liberação pausada (disputa)</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Aguardando liberação</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
        <Card className="shadow-xl border-white/50 bg-white/95 backdrop-blur">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">Ganhos de Hoje</p>
              <p className="text-3xl font-bold text-primary">R$ 145,00</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground font-medium mb-1">Taxa de Aceitação</p>
              <p className="text-xl font-bold">98%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Offer Dialog */}
      <Dialog open={!!pendingJob} onOpenChange={(o) => !o && setPendingJob(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl border-accent border-2 shadow-2xl animate-fade-in-up">
          <DialogHeader>
            <div className="mx-auto bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mb-2 animate-pulse">
              <Clock className="h-8 w-8 text-accent" />
            </div>
            <DialogTitle className="text-center text-2xl font-bold">
              Nova Solicitação: {pendingJob?.expand?.service_id?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl">
              <span className="text-muted-foreground">Valor Estimado</span>
              <span className="text-2xl font-bold text-secondary">
                R$ {pendingJob?.price?.toFixed(2)}
              </span>
            </div>

            {pendingJob?.hours ? (
              <>
                <div className="flex justify-between items-center text-sm px-1">
                  <span className="text-muted-foreground">Duração estimada</span>
                  <span className="font-medium">{pendingJob.hours}h</span>
                </div>
                {(() => {
                  const svcPrice = pendingJob?.expand?.service_id?.base_price
                  const hrs = Number(pendingJob.hours) || 0
                  const mult = getHourMultiplier(hrs, settings)
                  const band = shortJobBand(hrs, settings)
                  if (!svcPrice) return null
                  return (
                    <div className="flex justify-between items-center text-sm px-1">
                      <span className="text-muted-foreground">
                        Valor/hora efetivo{' '}
                        {band && (
                          <span className="text-amber-700 font-medium">
                            (sobretaxa {mult.toFixed(2)}×)
                          </span>
                        )}
                      </span>
                      <span className="font-medium">R$ {(svcPrice * mult).toFixed(2)}/h</span>
                    </div>
                  )
                })()}
              </>
            ) : null}

            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{pendingJob?.expand?.customer_id?.name}</p>
                  <p className="text-muted-foreground">{pendingJob?.address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Navigation className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {pendingJob?.type === 'emergency' ? 'Início Imediato (Emergência)' : 'Agendado'}
                  </p>
                  {pendingJob?.type === 'emergency' && (
                    <p className="text-accent font-medium">Multiplicador de emergência ativo!</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" className="w-full h-12" onClick={() => setPendingJob(null)}>
              Recusar
            </Button>
            <Button
              className="w-full h-12 bg-secondary hover:bg-secondary/90 text-white"
              onClick={acceptJob}
            >
              Aceitar Serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
