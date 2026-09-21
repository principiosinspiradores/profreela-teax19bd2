import { useState, useEffect } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Users,
  Activity,
  DollarSign,
  AlertTriangle,
  FileCheck,
  Check,
  X,
  ShieldAlert,
  Phone,
  Unlock,
  Lock,
  ExternalLink,
  Calendar,
  Clock,
  Loader2,
  RefreshCw,
  Scale,
  HandCoins,
  Banknote,
  CheckCircle2,
  XCircle,
  Coins,
  Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Link } from 'react-router-dom'
import {
  getModerationLogs,
  createModerationLog,
  getDocuments,
  updateDocument,
  updateUser,
  getAntiDisintermediationAlerts,
  getChatDisintermediationAlerts,
  adminUnlockPhone,
  getJobs,
  getProsWithPenalty,
  getPenaltyJobs,
  getProForModeration,
  forgivePenalty,
  type AntiDisintermediationAlert,
  type ChatDisintermediationAlert,
} from '@/services/api'
import { releasePayment, cancelAuthorization, captureSplitPayment } from '@/services/checkout'
import {
  getAllProPaymentAccounts,
  getAllPayouts,
  reviewProPaymentAccount,
  markPayoutAsPaid,
  markPayoutAsFailed,
  formatCPF,
  formatCNPJ,
  formatPixKey,
  ProPaymentAccount,
  PayoutRecord,
} from '@/services/payouts'
import { jobStatusLabel } from '@/lib/jobStatus'
import { formatPhoneNumber } from '@/lib/phone'
import { getAvatarUrl } from '@/lib/avatar'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/hooks/use-auth'

const demandData = [
  { time: '06:00', demand: 40, supply: 60 },
  { time: '09:00', demand: 120, supply: 80 },
  { time: '12:00', demand: 90, supply: 95 },
  { time: '15:00', demand: 150, supply: 70 },
  { time: '18:00', demand: 80, supply: 100 },
]

const chartConfig = {
  demand: { label: 'Demanda (Pedidos)', color: 'hsl(var(--chart-1))' },
  supply: { label: 'Oferta (Profissionais)', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

export default function AdminDashboard() {
  const [logs, setLogs] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [alerts, setAlerts] = useState<AntiDisintermediationAlert[]>([])
  const [chatAlerts, setChatAlerts] = useState<ChatDisintermediationAlert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [jobs, setJobs] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [unlockingJobId, setUnlockingJobId] = useState<string | null>(null)
  const [selectedPairJobsModal, setSelectedPairJobsModal] = useState<{
    clientName: string
    proName: string
    jobIds: string[]
  } | null>(null)

  // Entrega 2 — delay-driven penalties.
  const [penaltyPros, setPenaltyPros] = useState<any[]>([])
  const [penaltyJobs, setPenaltyJobs] = useState<any[]>([])
  const [loadingPenalties, setLoadingPenalties] = useState(false)
  const [forgivingProId, setForgivingProId] = useState<string | null>(null)
  const [disputeActionJobId, setDisputeActionJobId] = useState<string | null>(null)

  // Real professional shown in the "Moderação de Profissionais" card. Falls
  // back to null when there is no pro in the base, in which case the
  // Advertir/Bloquear buttons are hidden.
  const [moderationPro, setModerationPro] = useState<any | null>(null)
  const [moderating, setModerating] = useState(false)

  // Payments / Payouts state
  const { user: authUser } = useAuth()
  const [accounts, setAccounts] = useState<ProPaymentAccount[]>([])
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingPayouts, setLoadingPayouts] = useState(false)
  const [accountsFilter, setAccountsFilter] = useState<string>('all')
  const [payoutsFilter, setPayoutsFilter] = useState<string>('pending')

  // Review account modal
  const [reviewAccountModal, setReviewAccountModal] = useState<{
    account: ProPaymentAccount
    action: 'verified' | 'rejected'
  } | null>(null)
  const [reviewerNote, setReviewerNote] = useState('')
  const [reviewingAccount, setReviewingAccount] = useState(false)

  // Mark payout modal (paid or failed)
  const [payoutActionModal, setPayoutActionModal] = useState<{
    payout: PayoutRecord
    action: 'paid' | 'failed'
  } | null>(null)
  const [payoutNotes, setPayoutNotes] = useState('')
  const [processingPayout, setProcessingPayout] = useState(false)

  const { toast } = useToast()

  const loadDocs = async () => {
    const docs = await getDocuments()
    setDocuments(docs)
  }

  const loadAlerts = async () => {
    setLoadingAlerts(true)
    try {
      const [res, cAlerts] = await Promise.all([
        getAntiDisintermediationAlerts().catch(() => ({ ok: false, count: 0, alerts: [] })),
        getChatDisintermediationAlerts().catch(() => []),
      ])
      if (res && res.alerts) {
        setAlerts(res.alerts)
      }
      if (cAlerts) {
        setChatAlerts(cAlerts)
      }
    } catch (err: any) {
      console.error('Failed to load alerts', err)
    } finally {
      setLoadingAlerts(false)
    }
  }

  const loadAllJobs = async () => {
    setLoadingJobs(true)
    try {
      const jList = await getJobs()
      setJobs(jList)
    } catch (err) {
      console.error('Failed to load jobs', err)
    } finally {
      setLoadingJobs(false)
    }
  }

  // Entrega 2 — load pros with an outstanding penalty balance + the jobs that
  // generated each debit. Falls back to empty on any error.
  const loadPenalties = async () => {
    setLoadingPenalties(true)
    try {
      const [pros, pJobs] = await Promise.all([
        getProsWithPenalty().catch(() => []),
        getPenaltyJobs().catch(() => []),
      ])
      setPenaltyPros(pros || [])
      setPenaltyJobs(pJobs || [])
    } catch (err) {
      console.error('Failed to load penalties', err)
    } finally {
      setLoadingPenalties(false)
    }
  }

  const loadAccounts = async (statusFilter = accountsFilter) => {
    setLoadingAccounts(true)
    try {
      const accList = await getAllProPaymentAccounts(statusFilter)
      setAccounts(accList)
    } catch (err) {
      console.error('Failed to load payment accounts', err)
    } finally {
      setLoadingAccounts(false)
    }
  }

  const loadPayouts = async (statusFilter = payoutsFilter) => {
    setLoadingPayouts(true)
    try {
      const pList = await getAllPayouts(statusFilter)
      setPayouts(pList)
    } catch (err) {
      console.error('Failed to load payouts', err)
    } finally {
      setLoadingPayouts(false)
    }
  }

  const handleReviewAccount = async () => {
    if (!reviewAccountModal || !authUser?.id) return
    const { account, action } = reviewAccountModal
    setReviewingAccount(true)
    try {
      await reviewProPaymentAccount(account.id, action, authUser.id, reviewerNote)
      toast({
        title: action === 'verified' ? 'Conta aprovada' : 'Conta rejeitada',
        description:
          action === 'verified'
            ? `Conta de ${account.holder_name} foi verificada com sucesso.`
            : `Conta de ${account.holder_name} foi rejeitada.`,
      })
      setReviewAccountModal(null)
      setReviewerNote('')
      loadAccounts(accountsFilter)
    } catch (err: any) {
      toast({
        title: 'Erro ao analisar conta',
        description: err?.message || 'Não foi possível salvar a revisão.',
        variant: 'destructive',
      })
    } finally {
      setReviewingAccount(false)
    }
  }

  const handleExecutePayoutAction = async () => {
    if (!payoutActionModal) return
    const { payout, action } = payoutActionModal
    if (action === 'failed' && !payoutNotes.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo da falha do repasse.',
        variant: 'destructive',
      })
      return
    }

    setProcessingPayout(true)
    try {
      if (action === 'paid') {
        await markPayoutAsPaid(payout.id, payoutNotes)
        toast({
          title: 'Repasse marcado como pago',
          description: `Repasse no valor de R$ ${payout.amount_net.toFixed(2)} registrado como pago via Pix.`,
        })
      } else {
        await markPayoutAsFailed(payout.id, payoutNotes)
        toast({
          title: 'Repasse marcado como falho',
          description: 'O status do repasse foi atualizado para falha.',
          variant: 'destructive',
        })
      }
      setPayoutActionModal(null)
      setPayoutNotes('')
      loadPayouts(payoutsFilter)
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar repasse',
        description: err?.message || 'Não foi possível atualizar o repasse.',
        variant: 'destructive',
      })
    } finally {
      setProcessingPayout(false)
    }
  }

  // Entrega 2 — forgive (zero out) a pro's outstanding penalty balance.
  const handleReleasePayment = async (jobId: string) => {
    setDisputeActionJobId(jobId)
    try {
      const job = jobs.find((j) => j.id === jobId)
      if (job?.payment_status === 'disputed') {
        await captureSplitPayment(jobId, true) // force = true ignora status
      } else {
        await releasePayment(jobId)
      }
      toast({
        title: 'Pagamento liberado',
        description: 'O pagamento foi liberado com sucesso.',
      })
      await loadAllJobs()
    } catch (err: any) {
      toast({
        title: 'Erro ao liberar pagamento',
        description: err?.message || 'Não foi possível liberar o pagamento.',
        variant: 'destructive',
      })
    } finally {
      setDisputeActionJobId(null)
    }
  }

  const handleCancelAuthorization = async (jobId: string) => {
    setDisputeActionJobId(jobId)
    try {
      await cancelAuthorization(jobId)
      toast({
        title: 'Estorno realizado',
        description: 'A autorização de pagamento foi estornada/cancelada com sucesso.',
      })
      await loadAllJobs()
    } catch (err: any) {
      toast({
        title: 'Erro ao estornar pagamento',
        description: err?.message || 'Não foi possível estornar a autorização.',
        variant: 'destructive',
      })
    } finally {
      setDisputeActionJobId(null)
    }
  }

  const handleForgivePenalty = async (proId: string, proName: string) => {
    setForgivingProId(proId)
    try {
      const res = await forgivePenalty(proId)
      if (!res?.ok) {
        throw new Error(res?.error || 'Não foi possível perdoar o débito.')
      }
      toast({
        title: 'Débito perdoado',
        description: `O saldo devedor de ${proName} foi zerado${
          res.jobs_marked ? ` (${res.jobs_marked} serviço(s) marcados como perdoados)` : ''
        }.`,
      })
      loadPenalties()
    } catch (err: any) {
      toast({
        title: 'Erro ao perdoar débito',
        description: err?.message || 'Não foi possível perdoar o débito.',
        variant: 'destructive',
      })
    } finally {
      setForgivingProId(null)
    }
  }

  const loadModerationPro = async () => {
    const pro = await getProForModeration()
    setModerationPro(pro)
  }

  useEffect(() => {
    getModerationLogs().then(setLogs)
    loadDocs()
    loadAlerts()
    loadAllJobs()
    loadPenalties()
    loadModerationPro()
    loadAccounts()
    loadPayouts()
  }, [])

  useRealtime('documents', loadDocs)
  useRealtime('jobs', () => {
    loadAlerts()
    loadAllJobs()
    loadPenalties()
    loadPayouts()
  })
  useRealtime('disintermediation_alerts', () => {
    loadAlerts()
  })
  useRealtime('pro_payment_accounts', () => {
    loadAccounts()
  })
  useRealtime('payouts', () => {
    loadPayouts()
  })

  const handleToggleUnlockPhone = async (jobId: string, currentUnlocked: boolean) => {
    setUnlockingJobId(jobId)
    const nextState = !currentUnlocked
    try {
      const res = await adminUnlockPhone(jobId, nextState)
      toast({
        title: nextState ? 'Telefone liberado!' : 'Liberação revogada',
        description:
          res.message ||
          (nextState
            ? 'O cliente agora pode visualizar o telefone real do profissional para este serviço.'
            : 'O telefone voltou a ser mascarado para o cliente.'),
      })
      // Update local state
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, phone_unlocked_for_client: nextState } : j)),
      )
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar liberação',
        description: err?.message || 'Não foi possível alterar a liberação de telefone.',
        variant: 'destructive',
      })
    } finally {
      setUnlockingJobId(null)
    }
  }

  const handleAction = async (type: string) => {
    if (!moderationPro?.id) return
    setModerating(true)
    try {
      await createModerationLog({
        pro_id: moderationPro.id,
        type,
        reason: 'Manual review',
      })
      toast({
        title: 'Ação executada',
        description: `${moderationPro.name || 'Profissional'} marcado com ${type}.`,
      })
      // Refresh logs so the new entry appears.
      getModerationLogs().then(setLogs)
    } catch (err: any) {
      toast({
        title: 'Erro ao executar ação',
        description: err?.message || 'Não foi possível registrar a moderação.',
        variant: 'destructive',
      })
    } finally {
      setModerating(false)
    }
  }

  const handleVerify = async (doc: any, approved: boolean) => {
    try {
      await updateDocument(doc.id, { status: approved ? 'approved' : 'rejected' })
      if (approved && doc.expand?.user_id) {
        await updateUser(doc.expand.user_id.id, { status: 'active' })
      }
      toast({
        title: 'Documento Verificado',
        description: approved ? 'Documento aprovado e usuário ativo.' : 'Documento rejeitado.',
      })
      loadDocs()
    } catch (err) {
      toast({ title: 'Erro', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-muted-foreground">Gestão global da plataforma ProFreela.</p>
        </div>
        <div className="bg-accent/10 text-accent px-4 py-2 rounded-lg font-medium flex items-center gap-2 border border-accent/20">
          <AlertTriangle className="h-5 w-5" /> Região Central com alta demanda!
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="documents">Verificação de Documentos</TabsTrigger>
          <TabsTrigger value="alerts" className="relative">
            Anti-Desintermediação
            {alerts.length + chatAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px] h-4">
                {alerts.length + chatAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="phone-unlock">Liberação de Telefone</TabsTrigger>
          <TabsTrigger value="penalties" className="relative">
            Penalidades
            {penaltyPros.length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px] h-4">
                {penaltyPros.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="disputes" className="relative flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Disputas
            {jobs.filter((j) => j.payment_status === 'disputed').length > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] h-4">
                {jobs.filter((j) => j.payment_status === 'disputed').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payouts" className="relative flex items-center gap-1.5">
            <Banknote className="h-4 w-4" />
            Repasses / Contas
            {accounts.filter((a) => a.status === 'pending').length +
              payouts.filter((p) => p.status === 'pending').length >
              0 && (
              <Badge className="ml-1.5 px-1.5 py-0 text-[10px] h-4 bg-amber-500 hover:bg-amber-600 text-white">
                {accounts.filter((a) => a.status === 'pending').length +
                  payouts.filter((p) => p.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">GMV Hoje</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ 14.500</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Profissionais Online</CardTitle>
                <Users className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">243</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Serviços Ativos</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">89</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Docs Pendentes</CardTitle>
                <FileCheck className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-accent">
                  {documents.filter((d) => d.status === 'pending').length}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Demanda x Oferta (Tempo Real)</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <AreaChart data={demandData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="demand"
                      stroke="var(--color-demand)"
                      fill="var(--color-demand)"
                      fillOpacity={0.2}
                    />
                    <Area
                      type="monotone"
                      dataKey="supply"
                      stroke="var(--color-supply)"
                      fill="var(--color-supply)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Moderação de Profissionais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b pb-4">
                  {moderationPro ? (
                    <>
                      <div className="flex items-center gap-3">
                        <img
                          src={getAvatarUrl(moderationPro)}
                          alt={moderationPro.name || 'Profissional'}
                          className="w-10 h-10 rounded-full object-cover bg-muted"
                        />
                        <div>
                          <p className="font-medium">{moderationPro.name || 'Profissional'}</p>
                          <p className="text-xs text-muted-foreground">Reclamação de Cliente</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={moderating}
                          onClick={() => handleAction('warning')}
                        >
                          Advertir
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={moderating}
                          onClick={() => handleAction('block')}
                        >
                          Bloquear
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 text-muted-foreground py-2">
                      <Users className="h-5 w-5" />
                      <p className="text-sm">Nenhum profissional cadastrado para moderação</p>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <h4 className="text-sm font-bold mb-2">Heatmap Simulado (Google Maps)</h4>
                  <div className="h-32 bg-muted rounded-xl relative overflow-hidden border">
                    <img
                      src="https://img.usecurling.com/p/400/200?q=heatmap"
                      className="w-full h-full object-cover opacity-70 mix-blend-multiply"
                      alt="Heatmap"
                    />
                    <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      Campinas (Alta Demanda)
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Verificação de Documentos (KYC)</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-muted-foreground">Nenhum documento na base.</p>
              ) : (
                <div className="space-y-4">
                  {documents.filter((d) => d.status === 'pending').length === 0 && (
                    <p className="text-sm text-green-600 font-medium">
                      Todos os documentos revisados!
                    </p>
                  )}
                  {documents
                    .filter((d) => d.status === 'pending')
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4 bg-slate-50"
                      >
                        <div className="flex items-center gap-4">
                          <FileCheck className="h-8 w-8 text-primary" />
                          <div>
                            <p className="font-bold">
                              {doc.expand?.user_id?.name || 'Usuário Desconhecido'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Tipo: {doc.type} | ID: {doc.id}
                            </p>
                            {doc.file && (
                              <a
                                href="#"
                                className="text-sm text-blue-600 hover:underline block mt-1"
                              >
                                Ver Documento
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleVerify(doc, false)}
                          >
                            <X className="w-4 h-4 mr-2" /> Rejeitar
                          </Button>
                          <Button
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleVerify(doc, true)}
                          >
                            <Check className="w-4 h-4 mr-2" /> Aprovar
                          </Button>
                        </div>
                      </div>
                    ))}

                  <div className="mt-8">
                    <h3 className="font-bold text-lg mb-4">Histórico de Verificações</h3>
                    <div className="space-y-2">
                      {documents
                        .filter((d) => d.status !== 'pending')
                        .slice(0, 5)
                        .map((doc) => (
                          <div
                            key={doc.id}
                            className="flex justify-between items-center p-3 text-sm border rounded bg-white"
                          >
                            <span>{doc.expand?.user_id?.name}</span>
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${doc.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                            >
                              {doc.status === 'approved' ? 'APROVADO' : 'REJEITADO'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anti-Disintermediation Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          {/* Section 1: Chat Disintermediation Alerts */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-red-600">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  Alertas de Chat (Tentativas de Contato Externo)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Escaneamento automático em tempo real nas mensagens do chat. Registros gerados a
                  partir da 2ª detecção (reincidência) por serviço.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAlerts}
                disabled={loadingAlerts}
                className="gap-2 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loadingAlerts ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAlerts ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando alertas de chat...
                </div>
              ) : chatAlerts.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                  <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">
                    Nenhuma reincidência de contato no chat
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nenhuma violação grave registrada nos chats monitorados.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Padrão Detectado</TableHead>
                        <TableHead>Trecho da Mensagem</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chatAlerts.map((ca) => {
                        const proUser = ca.expand?.pro_id
                        const clientUser = ca.expand?.client_id
                        const jobData = ca.expand?.job
                        const serviceName = jobData?.expand?.service_id?.name || 'Serviço'

                        return (
                          <TableRow key={ca.id} className="bg-red-50/30">
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(ca.created).toLocaleDateString('pt-BR')}{' '}
                                {new Date(ca.created).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium text-xs block">{serviceName}</span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  #{ca.job ? ca.job.slice(0, 6) : '-'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs">
                                <span className="font-medium block">
                                  {proUser?.name || 'Profissional'}
                                </span>
                                {proUser?.phone && (
                                  <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {formatPhoneNumber(proUser.phone)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs">
                                <span className="font-medium block">
                                  {clientUser?.name || 'Cliente'}
                                </span>
                                {clientUser?.phone && (
                                  <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {formatPhoneNumber(clientUser.phone)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="destructive" className="text-[11px] font-mono">
                                {ca.pattern_matched || 'contato externo'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="p-2 bg-background border rounded text-xs text-red-950 font-mono break-words">
                                "{ca.detected_content}"
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {ca.job && (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="text-xs gap-1"
                                >
                                  <Link to={`/chat/${ca.job}`} target="_blank">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Abrir Chat
                                  </Link>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Pattern-based Disintermediation Alerts */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  Alertas de Padrão e Histórico de Serviços
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Monitoramento de pares recorrentes, jobs com duração suspeita (&lt; 15 min) e
                  solicitações frequentes em 7 dias.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="p-3 border rounded-lg bg-red-50/50 border-red-200">
                  <span className="font-semibold text-red-900 block">1. Mesmo Par 3+ Vezes</span>
                  <p className="text-xs text-red-700 mt-0.5">
                    Cliente e profissional com 3 ou mais serviços concluídos juntos.
                  </p>
                </div>
                <div className="p-3 border rounded-lg bg-amber-50/50 border-amber-200">
                  <span className="font-semibold text-amber-900 block">2. Jobs Muito Curtos</span>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Duração &lt; 15 min entre início e conclusão (suspeita de troca de contato).
                  </p>
                </div>
                <div className="p-3 border rounded-lg bg-blue-50/50 border-blue-200">
                  <span className="font-semibold text-blue-900 block">
                    3. Janela Curta (7 dias)
                  </span>
                  <p className="text-xs text-blue-700 mt-0.5">
                    2 ou mais serviços solicitados para o mesmo par em intervalo de até 7 dias.
                  </p>
                </div>
              </div>

              {loadingAlerts ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Analisando dados da
                  plataforma...
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                  <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">Nenhum alerta de padrão detectado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Todos os serviços monitorados estão dentro dos padrões normais de uso.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border transition-all ${
                        alert.severity === 'high'
                          ? 'bg-red-50/40 border-red-200'
                          : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={alert.severity === 'high' ? 'destructive' : 'default'}
                              className="text-xs"
                            >
                              {alert.severity === 'high' ? 'Alto Risco' : 'Atenção'}
                            </Badge>
                            <span className="font-bold text-foreground text-base">
                              {alert.title}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{alert.description}</p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-xs">
                            <div className="p-2 rounded bg-background/80 border">
                              <span className="text-muted-foreground block">Profissional:</span>
                              <span className="font-medium text-foreground block truncate">
                                {alert.proName}
                              </span>
                              {alert.proPhone && (
                                <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />
                                  {formatPhoneNumber(alert.proPhone)}
                                </span>
                              )}
                            </div>
                            <div className="p-2 rounded bg-background/80 border">
                              <span className="text-muted-foreground block">Cliente:</span>
                              <span className="font-medium text-foreground block truncate">
                                {alert.clientName}
                              </span>
                              {alert.clientPhone && (
                                <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />
                                  {formatPhoneNumber(alert.clientPhone)}
                                </span>
                              )}
                            </div>
                            <div className="p-2 rounded bg-background/80 border">
                              <span className="text-muted-foreground block">Jobs Juntos:</span>
                              <span className="font-medium text-foreground block">
                                {alert.completedJobsTogether !== undefined
                                  ? `${alert.completedJobsTogether} concluídos (${alert.totalJobsTogether || alert.completedJobsTogether} total)`
                                  : alert.jobId
                                    ? `Job #${alert.jobId.slice(0, 6)}`
                                    : '-'}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-background/80 border">
                              <span className="text-muted-foreground block">
                                Período / Duração:
                              </span>
                              <span className="font-medium text-foreground block">
                                {alert.durationMinutes !== undefined
                                  ? `${alert.durationMinutes} minutos`
                                  : alert.firstJobDate
                                    ? `${new Date(alert.firstJobDate).toLocaleDateString('pt-BR')} ${
                                        alert.lastJobDate &&
                                        alert.lastJobDate !== alert.firstJobDate
                                          ? 'até ' +
                                            new Date(alert.lastJobDate).toLocaleDateString('pt-BR')
                                          : ''
                                      }`
                                    : '-'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex md:flex-col gap-2 shrink-0 justify-end">
                          {alert.jobIds && alert.jobIds.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                setSelectedPairJobsModal({
                                  clientName: alert.clientName,
                                  proName: alert.proName,
                                  jobIds: alert.jobIds || [],
                                })
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Ver Jobs ({alert.jobIds.length})
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emergency Phone Unlock Tab */}
        <TabsContent value="phone-unlock" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Phone className="h-5 w-5 text-primary" />
                  Liberação Manual de Emergência do Telefone
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Por padrão, o cliente visualiza apenas o telefone mascarado (ex: (11) 9****-1234)
                  até a conclusão e confirmação do pagamento. Em casos de urgência ou suporte, o
                  administrador pode liberar o telefone real individualmente por serviço.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllJobs}
                disabled={loadingJobs}
                className="gap-2 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loadingJobs ? 'animate-spin' : ''}`} />
                Atualizar Lista
              </Button>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando serviços...
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum serviço registrado.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Telefone Pro</TableHead>
                        <TableHead>Status Job</TableHead>
                        <TableHead>Status Telefone</TableHead>
                        <TableHead className="text-right">Ação Admin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const isUnlocked = Boolean(job.phone_unlocked_for_client)
                        const proUser = job.expand?.pro_id
                        const clientUser = job.expand?.customer_id
                        const isCompletedAndPaid =
                          job.status === 'completed' &&
                          (job.payment_status === 'released' || job.payment_status === 'captured')

                        return (
                          <TableRow key={job.id}>
                            <TableCell className="font-mono text-xs">
                              #{job.id.slice(0, 6)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {job.expand?.service_id?.name || 'Serviço'}
                            </TableCell>
                            <TableCell>{clientUser?.name || '-'}</TableCell>
                            <TableCell>{proUser?.name || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {proUser?.phone ? formatPhoneNumber(proUser.phone) : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {jobStatusLabel(job.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isUnlocked ? (
                                <Badge className="bg-green-600 hover:bg-green-700 text-white gap-1 text-[11px]">
                                  <Unlock className="h-3 w-3" /> Liberado (Manual)
                                </Badge>
                              ) : isCompletedAndPaid ? (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 text-[11px] text-green-700 bg-green-50 border-green-200"
                                >
                                  <Check className="h-3 w-3" /> Liberado (Concluído)
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="gap-1 text-[11px] text-slate-600"
                                >
                                  <Lock className="h-3 w-3" /> Mascarado
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={isUnlocked ? 'outline' : 'default'}
                                className={
                                  isUnlocked
                                    ? 'border-red-300 text-red-700 hover:bg-red-50 text-xs'
                                    : 'bg-primary hover:bg-primary/90 text-xs'
                                }
                                disabled={unlockingJobId === job.id}
                                onClick={() => handleToggleUnlockPhone(job.id, isUnlocked)}
                              >
                                {unlockingJobId === job.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                ) : isUnlocked ? (
                                  <Lock className="h-3.5 w-3.5 mr-1" />
                                ) : (
                                  <Unlock className="h-3.5 w-3.5 mr-1" />
                                )}
                                {isUnlocked ? 'Revogar Liberação' : 'Liberar Telefone'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Penalties Tab — Entrega 2 */}
        <TabsContent value="penalties" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Scale className="h-5 w-5 text-amber-600" />
                  Penalidades por Atraso (Débitos Pendentes)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Profissionais que causaram cancelamento por atraso (+15 min) e geraram uma
                  reabertura emergencial. A diferença de 20% do emergencial é debitada do próximo
                  recebimento do profissional.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadPenalties}
                disabled={loadingPenalties}
                className="gap-2 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loadingPenalties ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPenalties ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando penalidades...
                </div>
              ) : penaltyPros.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                  <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">Nenhum débito pendente</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nenhum profissional possui saldo devedor no momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {penaltyPros.map((pro) => {
                    const proJobs = penaltyJobs.filter(
                      (j) => j.pro_id === pro.id && !j.penalty_forgiven,
                    )
                    return (
                      <div
                        key={pro.id}
                        className="p-4 rounded-xl border bg-amber-50/40 border-amber-200"
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-amber-600 hover:bg-amber-700 text-white">
                                Débito pendente
                              </Badge>
                              <span className="font-bold text-foreground text-base">
                                {pro.name || 'Profissional'}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                              <div className="p-2 rounded bg-background/80 border">
                                <span className="text-muted-foreground block">Saldo devedor:</span>
                                <span className="font-semibold text-amber-900 block">
                                  R${' '}
                                  {Number(pro.penalty_balance || 0)
                                    .toFixed(2)
                                    .replace('.', ',')}
                                </span>
                              </div>
                              <div className="p-2 rounded bg-background/80 border">
                                <span className="text-muted-foreground block">
                                  Serviços penalizados:
                                </span>
                                <span className="font-medium text-foreground block">
                                  {proJobs.length}
                                </span>
                              </div>
                              <div className="p-2 rounded bg-background/80 border">
                                <span className="text-muted-foreground block">Telefone:</span>
                                <span className="font-medium text-foreground block">
                                  {pro.phone || '-'}
                                </span>
                              </div>
                            </div>

                            {proJobs.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {proJobs.map((pj) => (
                                  <div
                                    key={pj.id}
                                    className="text-xs flex items-center justify-between gap-2 border-t border-amber-200 pt-1"
                                  >
                                    <span className="truncate">
                                      {pj.expand?.service_id?.name || 'Serviço'} —{' '}
                                      {pj.cancelled_at
                                        ? new Date(pj.cancelled_at).toLocaleDateString('pt-BR')
                                        : '-'}
                                    </span>
                                    <span className="font-semibold whitespace-nowrap">
                                      R${' '}
                                      {Number(pj.penalty_amount || 0)
                                        .toFixed(2)
                                        .replace('.', ',')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex md:flex-col gap-2 shrink-0 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                              disabled={forgivingProId === pro.id}
                              onClick={() =>
                                handleForgivePenalty(pro.id, pro.name || 'Profissional')
                              }
                            >
                              {forgivingProId === pro.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <HandCoins className="h-3.5 w-3.5" />
                              )}
                              Perdoar débito
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Disputes Tab */}
        <TabsContent value="disputes" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-red-600">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Gestão de Disputas
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Serviços com pagamentos contestados pelo cliente aguardando moderação. Libere o
                  pagamento para o profissional ou estorne o valor para o cliente.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllJobs}
                disabled={loadingJobs}
                className="gap-2 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${loadingJobs ? 'animate-spin' : ''}`} />
                Atualizar Lista
              </Button>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando disputas...
                </div>
              ) : jobs.filter((j) => j.payment_status === 'disputed').length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                  <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">Nenhuma disputa ativa</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Todos os pagamentos estão regularizados e sem contestações abertas.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs
                        .filter((j) => j.payment_status === 'disputed')
                        .map((job) => {
                          const proUser = job.expand?.pro_id
                          const clientUser = job.expand?.customer_id
                          const isProcessing = disputeActionJobId === job.id

                          return (
                            <TableRow key={job.id}>
                              <TableCell className="font-mono text-xs">
                                #{job.id.slice(0, 6)}
                              </TableCell>
                              <TableCell className="font-medium">
                                {job.expand?.service_id?.name || 'Serviço'}
                              </TableCell>
                              <TableCell>{clientUser?.name || '-'}</TableCell>
                              <TableCell>{proUser?.name || '-'}</TableCell>
                              <TableCell className="font-medium whitespace-nowrap">
                                R${' '}
                                {Number(job.price || 0)
                                  .toFixed(2)
                                  .replace('.', ',')}
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <span className="text-xs text-red-950 block break-words">
                                  {job.dispute_reason || 'Motivo não especificado'}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {job.payment_disputed_at
                                    ? new Date(job.payment_disputed_at).toLocaleDateString('pt-BR')
                                    : new Date(job.created).toLocaleDateString('pt-BR')}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                                    disabled={isProcessing}
                                    onClick={() => handleReleasePayment(job.id)}
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    Liberar Pagamento
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="text-xs gap-1"
                                    disabled={isProcessing}
                                    onClick={() => handleCancelAuthorization(job.id)}
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                    Estornar
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payouts / Contas de Recebimento Tab */}
        <TabsContent value="payouts" className="space-y-6">
          {/* Section 1: Contas de Pagamento dos Profissionais */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-5 w-5 text-primary" />
                  Fila de Verificação de Contas Pix / Bancárias
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Validação dos dados de recebimento cadastrados pelos profissionais para liberação
                  de repasses.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={accountsFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setAccountsFilter('all')
                    loadAccounts('all')
                  }}
                >
                  Todas
                </Button>
                <Button
                  variant={accountsFilter === 'pending' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setAccountsFilter('pending')
                    loadAccounts('pending')
                  }}
                >
                  Pendentes ({accounts.filter((a) => a.status === 'pending').length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAccounts(accountsFilter)}
                  disabled={loadingAccounts}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAccounts ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando contas...
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">Nenhuma conta encontrada</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nenhum profissional cadastrou dados de recebimento neste filtro.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Titular / Documento</TableHead>
                        <TableHead>Chave Pix</TableHead>
                        <TableHead>Banco / Agência / Conta</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Atualizado em</TableHead>
                        <TableHead className="text-right">Ação Admin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map((acc) => {
                        const proUser = acc.expand?.user_id
                        const formattedDoc =
                          acc.doc_type === 'cnpj'
                            ? formatCNPJ(acc.doc_number)
                            : formatCPF(acc.doc_number)
                        const formattedKey = acc.pix_key_type
                          ? formatPixKey(acc.pix_key_type, acc.pix_key || '')
                          : acc.pix_key || '—'

                        return (
                          <TableRow key={acc.id}>
                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">
                                {proUser?.name || 'Profissional'}
                              </div>
                              <div className="text-xs text-muted-foreground">{proUser?.email}</div>
                              {proUser?.phone && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {formatPhoneNumber(proUser.phone)}
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">
                                {acc.holder_name}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {acc.doc_type?.toUpperCase()}: {formattedDoc}
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="text-xs font-semibold uppercase text-slate-500">
                                {acc.pix_key_type && acc.pix_key_type !== 'none'
                                  ? `Pix (${acc.pix_key_type})`
                                  : 'Sem Pix'}
                              </div>
                              {acc.pix_key ? (
                                <div
                                  className="text-xs font-mono select-all bg-muted/50 p-1 rounded max-w-[220px] truncate"
                                  title={formattedKey}
                                >
                                  {formattedKey}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs">
                              {acc.bank_name ? (
                                <div>
                                  <span className="font-medium">{acc.bank_name}</span>
                                  <div className="text-muted-foreground font-mono text-[11px]">
                                    Ag: {acc.bank_agency || '—'} / CC: {acc.bank_account || '—'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Não informado</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {acc.status === 'verified' && (
                                <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                                  Verificada
                                </Badge>
                              )}
                              {acc.status === 'pending' && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 text-xs">
                                  <Clock className="h-3 w-3 mr-1 text-amber-600" />
                                  Pendente
                                </Badge>
                              )}
                              {acc.status === 'rejected' && (
                                <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100 text-xs">
                                  <XCircle className="h-3 w-3 mr-1 text-red-600" />
                                  Rejeitada
                                </Badge>
                              )}
                              {acc.reviewer_note && (
                                <div
                                  className="text-[11px] text-red-700 mt-1 max-w-[150px] truncate"
                                  title={acc.reviewer_note}
                                >
                                  Nota: {acc.reviewer_note}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(acc.updated || acc.created).toLocaleDateString('pt-BR')}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {acc.status !== 'verified' && (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 px-2.5"
                                    onClick={() => {
                                      setReviewAccountModal({ account: acc, action: 'verified' })
                                      setReviewerNote('')
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                                  </Button>
                                )}
                                {acc.status !== 'rejected' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50 text-xs h-8 px-2.5"
                                    onClick={() => {
                                      setReviewAccountModal({ account: acc, action: 'rejected' })
                                      setReviewerNote('')
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Fila de Repasses (Payouts) */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Banknote className="h-5 w-5 text-green-600" />
                  Execução de Repasses (Payouts via Pix)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Valores liberados após o período de garantia retidos para repasse ao profissional.
                  Confirme o Pix manualmente e registre o status.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={payoutsFilter === 'pending' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setPayoutsFilter('pending')
                    loadPayouts('pending')
                  }}
                >
                  Pendentes
                </Button>
                <Button
                  variant={payoutsFilter === 'paid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setPayoutsFilter('paid')
                    loadPayouts('paid')
                  }}
                >
                  Pagos
                </Button>
                <Button
                  variant={payoutsFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setPayoutsFilter('all')
                    loadPayouts('all')
                  }}
                >
                  Todos ({payouts.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPayouts(payoutsFilter)}
                  disabled={loadingPayouts}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingPayouts ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPayouts ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando repasses...
                </div>
              ) : payouts.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                  <Coins className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">
                    Nenhum repasse encontrado neste filtro
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Os repasses são criados automaticamente após a liberação da garantia de 24h.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Chave Pix Cadastrada</TableHead>
                        <TableHead>Serviço / Job</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead className="text-right">Débito</TableHead>
                        <TableHead className="text-right">Líquido</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ação Admin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payouts.map((p) => {
                        const proUser = p.expand?.pro_id
                        const proAcc = accounts.find((a) => a.user_id === p.pro_id)
                        const jobData = p.expand?.job_id
                        const serviceName = jobData?.expand?.service_id?.name || 'Serviço'

                        const formattedKey = proAcc?.pix_key_type
                          ? formatPixKey(proAcc.pix_key_type, proAcc.pix_key || '')
                          : proAcc?.pix_key || '—'

                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">
                                {proUser?.name || 'Profissional'}
                              </div>
                              <div className="text-xs text-muted-foreground">{proUser?.email}</div>
                              {proAcc && (
                                <div className="mt-0.5">
                                  {proAcc.status === 'verified' ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-green-700 bg-green-50 border-green-200"
                                    >
                                      Conta Verificada
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-amber-700 bg-amber-50 border-amber-200"
                                    >
                                      Conta {proAcc.status}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              {proAcc?.pix_key ? (
                                <div>
                                  <div
                                    className="text-xs font-mono select-all bg-muted/60 p-1 rounded font-medium max-w-[200px] truncate"
                                    title={formattedKey}
                                  >
                                    {formattedKey}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    Titular: {proAcc.holder_name}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-red-600 font-medium">
                                  Sem chave Pix cadastrada
                                </span>
                              )}
                            </TableCell>

                            <TableCell>
                              <div className="font-medium text-xs">{serviceName}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                #{p.job_id ? p.job_id.slice(0, 6) : '—'}
                              </div>
                            </TableCell>

                            <TableCell className="text-right text-xs">
                              R${' '}
                              {Number(p.amount_gross || 0)
                                .toFixed(2)
                                .replace('.', ',')}
                            </TableCell>

                            <TableCell className="text-right text-xs text-muted-foreground">
                              - R${' '}
                              {Number(p.platform_fee || 0)
                                .toFixed(2)
                                .replace('.', ',')}
                            </TableCell>

                            <TableCell className="text-right text-xs">
                              {p.penalty_debit > 0 ? (
                                <span className="text-red-600 font-medium">
                                  - R$ {Number(p.penalty_debit).toFixed(2).replace('.', ',')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell className="text-right font-bold text-primary text-sm">
                              R${' '}
                              {Number(p.amount_net || 0)
                                .toFixed(2)
                                .replace('.', ',')}
                            </TableCell>

                            <TableCell className="text-center">
                              {p.status === 'paid' && (
                                <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Pago
                                </Badge>
                              )}
                              {p.status === 'pending' && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 text-xs">
                                  <Clock className="h-3 w-3 mr-1" /> Pendente
                                </Badge>
                              )}
                              {p.status === 'failed' && (
                                <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100 text-xs">
                                  <XCircle className="h-3 w-3 mr-1" /> Falhou
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-right">
                              {p.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 px-2.5"
                                    onClick={() => {
                                      setPayoutActionModal({ payout: p, action: 'paid' })
                                      setPayoutNotes('Transferência Pix manual confirmada.')
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5 mr-1" /> Marcar Pago (Pix)
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="text-xs h-8 px-2.5"
                                    onClick={() => {
                                      setPayoutActionModal({ payout: p, action: 'failed' })
                                      setPayoutNotes('')
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5 mr-1" /> Falhou
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {p.paid_at
                                    ? `Pago em ${new Date(p.paid_at).toLocaleDateString('pt-BR')}`
                                    : p.notes || 'Concluído'}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal for viewing details of jobs in an alert */}
      <Dialog
        open={!!selectedPairJobsModal}
        onOpenChange={(open) => !open && setSelectedPairJobsModal(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              Histórico de Serviços do Par
            </DialogTitle>
            <DialogDescription>
              {selectedPairJobsModal?.clientName} (Cliente) e {selectedPairJobsModal?.proName}{' '}
              (Profissional)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {jobs
              .filter((j) => selectedPairJobsModal?.jobIds.includes(j.id))
              .map((j) => (
                <div
                  key={j.id}
                  className="p-3 border rounded-lg flex items-center justify-between gap-3 text-sm bg-muted/20"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">#{j.id.slice(0, 6)}</span>
                      <span className="font-medium">{j.expand?.service_id?.name || 'Serviço'}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {jobStatusLabel(j.status)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(j.created).toLocaleDateString('pt-BR')}
                      </span>
                      {j.started_at && j.completed_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.round(
                            (new Date(j.completed_at).getTime() -
                              new Date(j.started_at).getTime()) /
                              60000,
                          )}{' '}
                          minutos de execução
                        </span>
                      )}
                      <span>R$ {j.price?.toFixed(2)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={j.phone_unlocked_for_client ? 'outline' : 'default'}
                    className="text-xs shrink-0"
                    disabled={unlockingJobId === j.id}
                    onClick={() =>
                      handleToggleUnlockPhone(j.id, Boolean(j.phone_unlocked_for_client))
                    }
                  >
                    {j.phone_unlocked_for_client ? 'Revogar Telefone' : 'Liberar Telefone'}
                  </Button>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPairJobsModal(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal for Reviewing Pro Payment Account */}
      <Dialog
        open={!!reviewAccountModal}
        onOpenChange={(open) => !open && setReviewAccountModal(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAccountModal?.action === 'verified' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Aprovar Conta de Recebimento
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Rejeitar Conta de Recebimento
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Titular: {reviewAccountModal?.account.holder_name} (
              {reviewAccountModal?.account.doc_type?.toUpperCase()}:{' '}
              {reviewAccountModal?.account.doc_type === 'cnpj'
                ? formatCNPJ(reviewAccountModal?.account.doc_number || '')
                : formatCPF(reviewAccountModal?.account.doc_number || '')}
              )
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="review-note">
                Observação / Motivo{' '}
                {reviewAccountModal?.action === 'rejected' && (
                  <span className="text-red-500">*</span>
                )}
              </Label>
              <Textarea
                id="review-note"
                placeholder={
                  reviewAccountModal?.action === 'verified'
                    ? 'Opcional: Ex. Documentação conferida e chave Pix testada.'
                    : 'Informe o motivo da reprovação para que o profissional possa corrigir (ex: CPF do titular diverge da chave Pix informada).'
                }
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewAccountModal(null)}
              disabled={reviewingAccount}
            >
              Cancelar
            </Button>
            <Button
              className={
                reviewAccountModal?.action === 'verified'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
              onClick={handleReviewAccount}
              disabled={reviewingAccount}
            >
              {reviewingAccount ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...
                </>
              ) : reviewAccountModal?.action === 'verified' ? (
                'Confirmar Aprovação'
              ) : (
                'Confirmar Reprovação'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal for Executing / Failing Payout */}
      <Dialog
        open={!!payoutActionModal}
        onOpenChange={(open) => !open && setPayoutActionModal(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {payoutActionModal?.action === 'paid' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Confirmar Repasse Realizado via Pix
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Marcar Repasse como Falho
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Valor líquido a repassar:{' '}
              <span className="font-bold text-foreground">
                R${' '}
                {Number(payoutActionModal?.payout.amount_net || 0)
                  .toFixed(2)
                  .replace('.', ',')}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {payoutActionModal?.action === 'paid' ? (
              <div className="p-3 bg-muted/40 rounded-lg border text-xs text-muted-foreground space-y-1">
                <p>
                  A transferência do Pix deve ser realizada pelo operador financeiro via internet
                  banking / aplicativo.
                </p>
                <p>
                  Ao confirmar aqui, o sistema registrará o repasse como <strong>Pago</strong> e
                  atualizará o extrato do profissional em tempo real.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-800 space-y-1">
                <p className="font-semibold">Atenção:</p>
                <p>
                  Marcar o repasse como falho informará o profissional e manterá o valor pendente
                  para revisão ou correção dos dados.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payout-note">
                Observação / Comprovante{' '}
                {payoutActionModal?.action === 'failed' && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="payout-note"
                placeholder={
                  payoutActionModal?.action === 'paid'
                    ? 'Ex: ID E2E do Pix ou comprovante bancário'
                    : 'Ex: Chave Pix inexistente no banco central ou conta bloqueada'
                }
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayoutActionModal(null)}
              disabled={processingPayout}
            >
              Cancelar
            </Button>
            <Button
              className={
                payoutActionModal?.action === 'paid'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
              onClick={handleExecutePayoutAction}
              disabled={processingPayout}
            >
              {processingPayout ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Atualizando...
                </>
              ) : payoutActionModal?.action === 'paid' ? (
                'Confirmar Pagamento'
              ) : (
                'Confirmar Falha'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
