import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Wallet, TrendingUp, ArrowDownRight } from 'lucide-react'

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
  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meus Ganhos</h1>
        <p className="text-muted-foreground">Acompanhe seu faturamento semanal.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <Wallet className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">R$ 845,00</div>
            <p className="text-xs opacity-75 mt-1">Pronto para saque</p>
          </CardContent>
        </Card>
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
