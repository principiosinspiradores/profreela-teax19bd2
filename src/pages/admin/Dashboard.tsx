import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Users, Activity, DollarSign, AlertTriangle } from 'lucide-react'

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
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-muted-foreground">Gestão global da plataforma ProFreela.</p>
        </div>
        <div className="bg-accent/10 text-accent px-4 py-2 rounded-lg font-medium flex items-center gap-2 border border-accent/20">
          <AlertTriangle className="h-5 w-5" /> Região Central com alta demanda! (Multiplicador 1.5x
          ativo)
        </div>
      </div>

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
            <CardTitle className="text-sm font-medium">Cadastros Pendentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">12</div>
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
            <CardTitle>Aprovações Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Carlos E. {i}</p>
                    <p className="text-xs text-muted-foreground">Ajudante Geral • Doc. Pendente</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded hover:bg-secondary hover:text-white transition-colors">
                    Aprovar
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
