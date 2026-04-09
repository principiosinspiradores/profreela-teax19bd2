import { Link } from 'react-router-dom'
import { PlusCircle, Search, Clock, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export default function ClientDashboard() {
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
                <h3 className="text-3xl font-bold text-primary">2</h3>
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
                <h3 className="text-3xl font-bold">5</h3>
              </div>
              <div className="bg-muted p-3 rounded-full">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Requests */}
      <div>
        <h2 className="text-xl font-bold mb-4">Serviços em Andamento</h2>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-0 flex flex-col md:flex-row">
                <div className="md:w-48 h-32 bg-muted relative">
                  <img
                    src={`https://img.usecurling.com/p/200/200?q=cleaning&color=blue&seed=${i}`}
                    className="w-full h-full object-cover"
                    alt="Service"
                  />
                  <Badge className="absolute top-2 right-2 bg-secondary">Em andamento</Badge>
                </div>
                <div className="p-6 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg">Faxina Comercial - Padrão</h3>
                      <p className="text-sm text-muted-foreground">Hoje, 08:00 - 17:00</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">R$ 180,00</p>
                      <p className="text-xs text-muted-foreground">Pago via Cartão</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t">
                    <img
                      src={`https://img.usecurling.com/ppl/thumbnail?gender=female&seed=${i + 10}`}
                      className="w-8 h-8 rounded-full"
                      alt="Pro"
                    />
                    <span className="text-sm font-medium">Maria S. (Profissional)</span>
                    <Button variant="link" size="sm" className="ml-auto h-auto py-0">
                      Enviar Mensagem
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
