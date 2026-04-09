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
import { Users, Activity, DollarSign, AlertTriangle, FileCheck, Check, X } from 'lucide-react'
import {
  getModerationLogs,
  createModerationLog,
  getDocuments,
  updateDocument,
  updateUser,
} from '@/services/api'
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
  const { toast } = useToast()

  const loadDocs = async () => {
    const docs = await getDocuments()
    setDocuments(docs)
  }

  useEffect(() => {
    getModerationLogs().then(setLogs)
    loadDocs()
  }, [])

  useRealtime('documents', loadDocs)

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
      </Tabs>
    </div>
  )
}
