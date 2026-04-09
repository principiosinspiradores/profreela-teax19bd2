import { useState, useEffect } from 'react'
import { MapPin, Navigation, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
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
import { getProJobs, updateJob } from '@/services/api'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'

export default function ProDashboard() {
  const [isOnline, setIsOnline] = useState(false)
  const [pendingJob, setPendingJob] = useState<any>(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  const loadJobs = async () => {
    if (!user || !isOnline) return
    const jobs = await getProJobs(user.id)
    const pending = jobs.find((j) => j.status === 'pending')
    if (pending && pending.id !== pendingJob?.id) {
      setPendingJob(pending)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [user, isOnline])
  useRealtime('jobs', loadJobs, isOnline)

  const acceptJob = async () => {
    if (!pendingJob) return
    try {
      await updateJob(pendingJob.id, { status: 'accepted', pro_id: user?.id })
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative rounded-xl overflow-hidden border">
      {/* Fake Map Background */}
      <div className="absolute inset-0 bg-slate-100 z-0">
        <img
          src="https://img.usecurling.com/p/1200/800?q=street%20map&color=gray&dpr=2"
          alt="Map"
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
      <div className="relative z-10 mt-auto m-4">
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
