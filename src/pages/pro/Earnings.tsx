import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Coins,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import {
  getProPaymentAccount,
  getProPayouts,
  PayoutRecord,
  ProPaymentAccount,
} from '@/services/payouts'
import { getSettings, type PlatformSettings } from '@/services/settings'

interface ProCompletedJob {
  id: string
  hours?: number
  clocked_in_at?: string
  started_at?: string
  completed_at?: string
}

interface ChartDayBucket {
  day: string
  dateKey: string
  amount: number
}

const chartConfig = {
  amount: {
    label: 'Ganhos (R$)',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig

const TIME_ZONE = 'America/Sao_Paulo'

/** Formata uma data para YYYY-MM-DD no fuso de São Paulo */
function getSaoPauloDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const y = parts.find((p) => p.type === 'year')?.value || '1970'
  const m = parts.find((p) => p.type === 'month')?.value || '01'
  const d = parts.find((p) => p.type === 'day')?.value || '01'
  return `${y}-${m}-${d}`
}

/** Formata o rótulo do dia da semana capitalizado em pt-BR (ex: 'Seg', 'Ter') */
function getSaoPauloDayLabel(date: Date): string {
  const weekday = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date)
  const clean = weekday.replace('.', '').trim()
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** Formata duração em horas decimais para string ex: '32h 15m' ou '0h' */
function formatHours(hoursDecimal: number): string {
  if (!hoursDecimal || hoursDecimal <= 0) return '0h'
  const totalMinutes = Math.round(hoursDecimal * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0 && m === 0) return '0h'
  if (m === 0) return `${h}h`
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export default function Earnings() {
  const { user } = useAuth()
  const [account, setAccount] = useState<ProPaymentAccount | null>(null)
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [completedJobs, setCompletedJobs] = useState<ProCompletedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<PlatformSettings | null>(null)

  useEffect(() => {
    if (user?.id) {
      loadData(user.id)
    }
  }, [user?.id])

  const loadData = async (userId: string) => {
    try {
      setLoading(true)
      // Buscar payouts e jobs completados nos últimos 7 dias (rolante)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const jobsFilter = `pro_id="${userId}" && status="completed" && completed_at >= "${sevenDaysAgo}"`

      const [acc, pList, jList, fetchedSettings] = await Promise.all([
        getProPaymentAccount(userId),
        getProPayouts(userId),
        pb.collection('jobs').getFullList<ProCompletedJob>({
          filter: jobsFilter,
          sort: '-completed_at',
        }),
        getSettings().catch(() => null),
      ])
      setAccount(acc)
      setPayouts(pList)
      setCompletedJobs(jList)
      if (fetchedSettings) setSettings(fetchedSettings)
    } catch (err) {
      console.error('Erro ao carregar dados de repasses:', err)
    } finally {
      setLoading(false)
    }
  }

  // Summaries
  const totalPending = payouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + (Number(p.amount_net) || 0), 0)

  const totalPaid = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount_net) || 0), 0)

  // Cálculos da semana atual e anterior (janela rolante de 7 dias)
  const {
    currentWeekRevenue,
    previousWeekRevenue,
    growthPercent,
    currentWeekHours,
    hourlyAverage,
    weeklyChartData,
  } = useMemo(() => {
    const now = Date.now()
    const ms7Days = 7 * 24 * 60 * 60 * 1000
    const currentWeekStart = now - ms7Days
    const previousWeekStart = now - 2 * ms7Days

    let revCurrent = 0
    let revPrevious = 0

    // Mapeamento dos 7 dias para o gráfico (do mais antigo ao mais recente)
    const dayBucketsMap = new Map<string, ChartDayBucket>()
    const chartBuckets: ChartDayBucket[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const dateKey = getSaoPauloDateKey(d)
      const dayLabel = getSaoPauloDayLabel(d)
      const bucket: ChartDayBucket = { day: dayLabel, dateKey, amount: 0 }
      dayBucketsMap.set(dateKey, bucket)
      chartBuckets.push(bucket)
    }

    payouts.forEach((p) => {
      if (!p.created) return
      const createdTime = new Date(p.created).getTime()
      if (isNaN(createdTime)) return
      const amount = Number(p.amount_net) || 0

      // Faturamento da semana (últimos 7 dias rolantes)
      if (createdTime >= currentWeekStart && createdTime <= now) {
        revCurrent += amount

        // Bucket por dia para o gráfico
        const pDateKey = getSaoPauloDateKey(new Date(p.created))
        const bucket = dayBucketsMap.get(pDateKey)
        if (bucket) {
          bucket.amount = Math.round((bucket.amount + amount) * 100) / 100
        }
      } else if (createdTime >= previousWeekStart && createdTime < currentWeekStart) {
        revPrevious += amount
      }
    })

    // Percentual vs semana anterior
    let growth: number | null = null
    if (revPrevious > 0) {
      growth = Math.round(((revCurrent - revPrevious) / revPrevious) * 100)
    }

    // Horas trabalhadas nos últimos 7 dias
    let totalHours = 0
    completedJobs.forEach((job) => {
      if (!job.completed_at) return
      const compTime = new Date(job.completed_at).getTime()
      if (compTime < currentWeekStart || compTime > now) return

      let jobH = Number(job.hours) || 0
      if (jobH <= 0) {
        const startStr = job.clocked_in_at || job.started_at
        if (startStr && job.completed_at) {
          const startMs = new Date(startStr).getTime()
          const endMs = new Date(job.completed_at).getTime()
          if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
            jobH = (endMs - startMs) / (1000 * 60 * 60)
          }
        }
      }
      totalHours += Math.max(0, jobH)
    })

    // Média por hora
    const avg = totalHours > 0 ? revCurrent / totalHours : null

    return {
      currentWeekRevenue: revCurrent,
      previousWeekRevenue: revPrevious,
      growthPercent: growth,
      currentWeekHours: totalHours,
      hourlyAverage: avg,
      weeklyChartData: chartBuckets,
    }
  }, [payouts, completedJobs])

  const formatCurrency = (val: number) =>
    Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_) {
      return dateStr
    }
  }

  const isAccountVerified = account?.status === 'verified'

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meus Ganhos & Repasses</h1>
        <p className="text-muted-foreground">
          Acompanhe seu faturamento, extrato de repasses via Pix e valores a receber.
        </p>
      </div>

      {/* Warning banner if payment account is not verified */}
      {!loading && !isAccountVerified && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-sm">
                {!account
                  ? 'Cadastre sua conta de recebimento nas Configurações para receber seus repasses.'
                  : account.status === 'pending'
                    ? 'Sua conta de recebimento está em análise. Os repasses serão liberados assim que verificada.'
                    : 'Sua conta de recebimento foi recusada. Atualize seus dados para receber os repasses.'}
              </p>
              <p className="text-xs text-amber-800">
                Os valores ficam acumulados como &quot;A receber&quot; com total segurança até a
                validação da conta.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0"
          >
            <Link to="/pro/settings" className="flex items-center gap-1.5">
              Configurar Conta <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* Payout summaries cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* A receber */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-900">
              A receber (Pendente)
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-950">{formatCurrency(totalPending)}</div>
            <p className="text-xs text-amber-800 mt-1">Aguardando liberação ou envio Pix</p>
          </CardContent>
        </Card>

        {/* Recebido */}
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-900">Recebido (Pago)</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-950">{formatCurrency(totalPaid)}</div>
            <p className="text-xs text-green-800 mt-1">Repasses já enviados via Pix</p>
          </CardContent>
        </Card>

        {/* Faturamento da Semana */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Faturamento da Semana</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '—' : formatCurrency(currentWeekRevenue)}
            </div>
            {!loading && growthPercent !== null && (
              <p
                className={`text-xs mt-1 font-medium flex items-center ${
                  growthPercent >= 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                {growthPercent >= 0 ? `+${growthPercent}%` : `${growthPercent}%`} vs semana anterior
              </p>
            )}
          </CardContent>
        </Card>

        {/* Horas Trabalhadas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Horas Trabalhadas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '—' : formatHours(currentWeekHours)}
            </div>
            {!loading && hourlyAverage !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Média {formatCurrency(hourlyAverage)}/h
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extrato de Repasses */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" /> Extrato de Repasses
              </CardTitle>
              <CardDescription>
                Histórico de valores brutos, deduções de taxa de plataforma, abates de penalidade e
                valor líquido transferido.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">
              {payouts.length} {payouts.length === 1 ? 'repasse' : 'repasses'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando extrato de repasses...
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Wallet className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-medium">Nenhum repasse registrado ainda</p>
              <p className="text-xs max-w-md mx-auto">
                Quando você concluir serviços e a garantia de{' '}
                {(settings?.guarantee_period_days ?? 1) === 1
                  ? '24h'
                  : `${settings?.guarantee_period_days ?? 1} dias`}{' '}
                expirar, os valores aparecerão aqui como pendentes de repasse Pix.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço / Data</TableHead>
                    <TableHead className="text-right">Valor Bruto</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Débito Déb.</TableHead>
                    <TableHead className="text-right">Valor Líquido</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Data Pagamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    const serviceName = p.expand?.job_id?.expand?.service_id?.name || 'Serviço'
                    const jobAddress = p.expand?.job_id?.address || ''
                    const jobDate =
                      p.expand?.job_id?.completed_at || p.expand?.job_id?.scheduled_at || p.created

                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{serviceName}</div>
                          {jobAddress && (
                            <div
                              className="text-xs text-muted-foreground truncate max-w-[200px]"
                              title={jobAddress}
                            >
                              {jobAddress}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">{formatDate(jobDate)}</div>
                        </TableCell>

                        <TableCell className="text-right font-medium">
                          {formatCurrency(p.amount_gross)}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground text-xs">
                          - {formatCurrency(p.platform_fee)}
                        </TableCell>

                        <TableCell className="text-right text-xs">
                          {p.penalty_debit > 0 ? (
                            <span className="text-red-600 font-medium">
                              - {formatCurrency(p.penalty_debit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-bold text-primary">
                          {formatCurrency(p.amount_net)}
                        </TableCell>

                        <TableCell className="text-center">
                          {p.status === 'paid' && (
                            <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Pago
                            </Badge>
                          )}
                          {p.status === 'pending' && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                              <Clock className="h-3 w-3 mr-1" /> Pendente
                            </Badge>
                          )}
                          {p.status === 'failed' && (
                            <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100">
                              <XCircle className="h-3 w-3 mr-1" /> Falhou
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">
                          {p.status === 'paid' ? formatDate(p.paid_at) : '—'}
                          {p.notes && (
                            <div
                              className="text-[11px] text-muted-foreground truncate max-w-[150px]"
                              title={p.notes}
                            >
                              {p.notes}
                            </div>
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

      {/* Visão semanal do gráfico */}
      <Card>
        <CardHeader>
          <CardTitle>Visão Semanal</CardTitle>
          <CardDescription>Seus ganhos por dia nos últimos 7 dias</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando visão semanal...
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={weeklyChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis
                  tickFormatter={(val) =>
                    Number(val || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                      maximumFractionDigits: 0,
                    })
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(val) => [formatCurrency(Number(val) || 0), 'Ganhos']}
                    />
                  }
                />
                <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
