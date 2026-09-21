import { useState, useEffect } from 'react'
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
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Coins,
  Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  getProPaymentAccount,
  getProPayouts,
  PayoutRecord,
  ProPaymentAccount,
} from '@/services/payouts'

const chartData = [
  { day: 'Seg', amount: 120 },
  { day: 'Ter', amount: 85 },
  { day: 'Qua', amount: 190 },
  { day: 'Qui', amount: 130 },
  { day: 'Sex', amount: 250 },
  { day: 'Sáb', amount: 310 },
  { day: 'Dom', amount: 200 },
]

const chartConfig = {
  amount: {
    label: 'Ganhos (R$)',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig

export default function Earnings() {
  const { user } = useAuth()
  const [account, setAccount] = useState<ProPaymentAccount | null>(null)
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) {
      loadData(user.id)
    }
  }, [user?.id])

  const loadData = async (userId: string) => {
    try {
      setLoading(true)
      const [acc, pList] = await Promise.all([getProPaymentAccount(userId), getProPayouts(userId)])
      setAccount(acc)
      setPayouts(pList)
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
            <div className="text-2xl font-bold">R$ 1.285,00</div>
            <p className="text-xs text-secondary mt-1 font-medium flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" /> +12% que a semana passada
            </p>
          </CardContent>
        </Card>

        {/* Horas Trabalhadas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Horas Trabalhadas</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32h 15m</div>
            <p className="text-xs text-muted-foreground mt-1">Média R$ 39,80/h</p>
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
                Quando você concluir serviços e a garantia de 24h expirar, os valores aparecerão
                aqui como pendentes de repasse Pix.
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
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis tickFormatter={(val) => `R${val}`} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
