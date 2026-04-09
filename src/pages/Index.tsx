import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Star, ShieldCheck, Clock } from 'lucide-react'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { Role } from '@/stores/useAuthStore'

export default function Index() {
  const [authOpen, setAuthOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role>('client')

  const openAuth = (role: Role) => {
    setSelectedRole(role)
    setAuthOpen(true)
  }

  return (
    <>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} initialRole={selectedRole} />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background pt-16 md:pt-24 pb-32">
        <div className="container relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary font-medium text-sm mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                </span>
                Plataforma ativa em Campinas e Região
              </div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6 leading-tight">
                Conectando empresas aos melhores{' '}
                <span className="text-primary">profissionais operacionais</span>.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
                A solução sob demanda tipo Uber para hotéis e empresas. Contrate faxineiras,
                camareiras e ajudantes em minutos, com segurança e preço justo.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  className="h-14 text-base shadow-lg"
                  onClick={() => openAuth('client')}
                >
                  Quero Contratar
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base bg-white"
                  onClick={() => openAuth('pro')}
                >
                  Quero Trabalhar
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-4 text-sm text-muted-foreground font-medium">
                <div className="flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-secondary" /> 100% Seguro
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-secondary" /> Verificados
                </div>
              </div>
            </div>

            <div className="relative animate-slide-up hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent rounded-3xl transform rotate-3 scale-105" />
              <img
                src="https://img.usecurling.com/p/600/400?q=cleaner%20hotel&color=blue"
                alt="Profissional trabalhando"
                className="relative rounded-3xl shadow-2xl object-cover border-4 border-white"
              />
              {/* Floating Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-xl flex items-center gap-4 animate-float">
                <div className="bg-secondary/20 p-3 rounded-full">
                  <Star className="h-6 w-6 text-secondary fill-secondary" />
                </div>
                <div>
                  <p className="font-bold text-lg">4.9/5</p>
                  <p className="text-sm text-muted-foreground">Avaliação média</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Admin shortcut for demo purposes */}
      <div className="container py-8 text-center border-t border-muted">
        <p className="text-sm text-muted-foreground mb-2">Área restrita (Apenas Demo)</p>
        <Button variant="ghost" size="sm" onClick={() => openAuth('admin')}>
          Acessar Painel Admin
        </Button>
      </div>
    </>
  )
}
