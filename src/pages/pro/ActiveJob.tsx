import { useState } from 'react'
import { MapPin, Navigation2, Camera, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'

export default function ActiveJob() {
  const [step, setStep] = useState<'transit' | 'arrived' | 'working' | 'finished'>('transit')
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleNextStep = () => {
    if (step === 'transit') setStep('arrived')
    else if (step === 'arrived') {
      toast({
        title: 'Foto enviada',
        description: 'Check-in validado com sucesso!',
        variant: 'default',
      })
      setStep('working')
    } else if (step === 'working') {
      toast({
        title: 'Serviço finalizado',
        description: 'Pagamento liberado na carteira.',
        variant: 'default',
      })
      navigate('/pro')
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
              <Button className="w-full h-14 text-lg" onClick={handleNextStep}>
                Cheguei no Local
              </Button>
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
                <p className="text-muted-foreground mb-8">
                  O cronômetro está rodando. Faça um ótimo trabalho!
                </p>
                <Button className="w-full h-14 text-lg bg-slate-900" onClick={handleNextStep}>
                  Finalizar Serviço
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
