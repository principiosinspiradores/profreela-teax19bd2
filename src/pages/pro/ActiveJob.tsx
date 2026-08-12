import { useState } from 'react'
import { MapPin, Navigation2, Camera, CheckCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { updateJob } from '@/services/api'
import { releasePayment } from '@/services/checkout'

export default function ActiveJob() {
  const [step, setStep] = useState<'transit' | 'arrived' | 'working' | 'finished'>('transit')
  const navigate = useNavigate()
  const { toast } = useToast()
  const { id: jobId } = useParams<{ id: string }>()

  const [distance, setDistance] = useState<number>(150)
  const [finishing, setFinishing] = useState(false)

  // Geofencing mock
  useState(() => {
    const interval = setInterval(() => {
      setDistance((prev) => Math.max(10, prev - 30))
    }, 2000)
    return () => clearInterval(interval)
  })

  const handleNextStep = async () => {
    if (step === 'transit') {
      if (distance > 100) {
        toast({
          title: 'Erro',
          description: 'Você precisa estar a menos de 100m do local para fazer check-in.',
          variant: 'destructive',
        })
        return
      }
      setStep('arrived')
    } else if (step === 'arrived') {
      // clock-in — record timestamp so the 24h auto-cancel rule is satisfied.
      if (jobId) {
        try {
          await updateJob(jobId, { clocked_in_at: new Date().toISOString() })
        } catch (_) {
          /* non-fatal */
        }
      }
      toast({
        title: 'Foto enviada',
        description: 'Check-in validado via GPS com sucesso!',
        variant: 'default',
      })
      setStep('working')
    } else if (step === 'working') {
      // clock-out + completion -> start the 7-day guarantee window.
      setFinishing(true)
      try {
        if (jobId) {
          await updateJob(jobId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          await releasePayment(jobId)
        }
        toast({
          title: 'Serviço finalizado',
          description: 'Iniciado o período de garantia de 7 dias. O pagamento será liberado após.',
          variant: 'default',
        })
        navigate('/pro')
      } catch {
        toast({
          title: 'Erro',
          description: 'Não foi possível finalizar o serviço.',
          variant: 'destructive',
        })
      } finally {
        setFinishing(false)
      }
    }
  }

  return (
    <div className="max-w-xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Serviço em Andamento</h1>
        <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-semibold">
          #{Math.floor(Math.random() * 10000)}
        </div>
      </div>

      <Card className="overflow-hidden border-2 shadow-sm">
        <div className="h-48 bg-slate-200 relative">
          <img
            src="https://img.usecurling.com/p/800/400?q=route%20map"
            alt="Rota"
            className="w-full h-full object-cover opacity-80"
          />
          {step === 'transit' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                size="lg"
                className="rounded-full shadow-xl bg-slate-900 text-white hover:bg-slate-800"
              >
                <Navigation2 className="mr-2 h-5 w-5" /> Abrir no Google Maps
              </Button>
            </div>
          )}
        </div>
        <CardContent className="p-6">
          <h2 className="text-xl font-bold mb-2">Hotel Plaza Campinas</h2>
          <p className="text-muted-foreground flex items-center gap-2 mb-6">
            <MapPin className="h-4 w-4" /> Av. Aquidabã, 400 - Centro, Campinas - SP
          </p>

          <div className="space-y-4">
            {step === 'transit' && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Distância atual: {distance}m</span>
                  <span>Necessário: &lt;100m</span>
                </div>
                <Button
                  className="w-full h-14 text-lg"
                  onClick={handleNextStep}
                  disabled={distance > 100}
                >
                  Clock-in (Cheguei no Local)
                </Button>
              </>
            )}

            {step === 'arrived' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center bg-muted/30">
                  <Camera className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="font-medium">Tire uma foto no local</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Obrigatório pela LGPD e segurança
                  </p>
                  <Button variant="outline" onClick={handleNextStep}>
                    Simular Upload
                  </Button>
                </div>
              </div>
            )}

            {step === 'working' && (
              <div className="text-center py-8 animate-fade-in">
                <div className="inline-flex h-20 w-20 rounded-full bg-secondary/20 items-center justify-center mb-4">
                  <CheckCircle className="h-10 w-10 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Trabalho em Execução</h3>
                <p className="text-muted-foreground mb-4">
                  O cronômetro está rodando. Faça um ótimo trabalho!
                </p>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2 mb-6 max-w-sm mx-auto">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Ao finalizar, inicia o período de garantia de 7 dias. Seu pagamento será
                    liberado após esse prazo, caso não haja disputa.
                  </span>
                </div>
                <Button
                  className="w-full h-14 text-lg bg-slate-900"
                  onClick={handleNextStep}
                  disabled={finishing}
                >
                  {finishing ? 'Finalizando...' : 'Finalizar Serviço'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
