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
  type AntiDisintermediationAlert,
  type ChatDisintermediationAlert,
} from '@/services/api'
import { formatPhoneNumber } from '@/lib/phone'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'

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

  useEffect(() => {
    getModerationLogs().then(setLogs)
    loadDocs()
    loadAlerts()
    loadAllJobs()
  }, [])

  useRealtime('documents', loadDocs)
  useRealtime('jobs', () => {
    loadAlerts()
    loadAllJobs()
  })
  useRealtime('disintermediation_alerts', () => {
    loadAlerts()
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
    await createModerationLog({ pro_id: 'sample', type, reason: 'Manual review' })
    toast({ title: 'Ação executada', description: `Usuário marcado com ${type}.` })
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
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Carlos E.</p>
                      <p className="text-xs text-muted-foreground">Reclamação de Cliente</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleAction('warning')}>
                      Advertir
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleAction('block')}>
                      Bloquear
                    </Button>
                  </div>
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
                                {job.status}
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
                        {j.status}
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
    </div>
  )
}
