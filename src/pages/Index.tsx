import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Star, ShieldCheck } from 'lucide-react'
import { AuthDialog } from '@/components/auth/AuthDialog'
import type { Role } from '@/hooks/use-auth'

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
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0D4F5C]/10 via-background to-background pt-16 md:pt-24 pb-32">
        <div className="container relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D4A017]/15 text-[#B3840E] dark:text-[#E5B429] font-medium text-sm mb-6 border border-[#D4A017]/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4A017] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D4A017]"></span>
                </span>
                ProFreela &bull; profreela.com.br
              </div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 dark:text-white mb-6 leading-tight">
                A inteligência operacional para o seu negócio com a{' '}
                <span className="inline-block">
                  <span className="text-[#0D4F5C] dark:text-[#146C7E]">Pro</span>
                  <span className="text-[#D4A017]">Freela</span>
                </span>
                .
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
                A solução sob demanda tipo Uber para hotéis, eventos e empresas. Contrate
                faxineiras, camareiras e ajudantes em minutos, com segurança e preço justo.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  className="h-14 text-base shadow-lg bg-[#D4A017] hover:bg-[#B3840E] text-slate-900 font-semibold px-8"
                  onClick={() => openAuth('client')}
                >
                  Quero Contratar
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base bg-white dark:bg-slate-900 text-[#0D4F5C] border-[#0D4F5C]/30 hover:border-[#0D4F5C] font-semibold px-8"
                  onClick={() => openAuth('pro')}
                >
                  Quero Trabalhar
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground font-medium">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#D4A017]" /> 100% Seguro
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#D4A017]" /> Profissionais Verificados
                </div>
              </div>
            </div>

            <div className="relative animate-slide-up hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#0D4F5C]/30 to-[#D4A017]/20 rounded-3xl transform rotate-3 scale-105" />
              <img
                src="https://img.usecurling.com/p/600/400?q=janitor"
                alt="Profissional ProFreela em atendimento corporativo"
                className="relative rounded-3xl shadow-2xl object-cover border-4 border-white dark:border-slate-800"
              />
              {/* Floating Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-xl flex items-center gap-4 border border-border">
                <div className="bg-[#D4A017]/20 p-3 rounded-full">
                  <Star className="h-6 w-6 text-[#D4A017] fill-[#D4A017]" />
                </div>
                <div>
                  <p className="font-bold text-lg text-slate-900 dark:text-white">4.9/5</p>
                  <p className="text-xs text-muted-foreground">Avaliação dos clientes ProFreela</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Como funciona</h2>
          <p className="text-lg text-muted-foreground">
            Três passos simples para contratar o profissional certo, no momento certo.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: CheckCircle2,
              title: '1. Solicite',
              desc: 'Descreva o serviço, informe o endereço e escolha agendado ou emergencial.',
            },
            {
              icon: Star,
              title: '2. Receba propostas',
              desc: 'Profissionais verificados próximos a você respondem em minutos.',
            },
            {
              icon: ShieldCheck,
              title: '3. Acompanhe',
              desc: 'Acompanhe o serviço em tempo real e pague com segurança pela plataforma.',
            },
          ].map((step) => (
            <div
              key={step.title}
              className="flex flex-col items-center text-center p-6 rounded-2xl border bg-card"
            >
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-24 pt-4 text-center">
        <div className="max-w-3xl mx-auto bg-[#0D4F5C] text-white p-10 md:p-14 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#D4A017]/20 rounded-full blur-2xl" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 relative z-10">
            Pronto para transformar sua contratação?
          </h2>
          <p className="text-lg text-slate-200 mb-8 max-w-xl mx-auto relative z-10">
            Junte-se a empresas que já otimizam suas contratações operacionais com a{' '}
            <strong className="text-[#D4A017]">ProFreela</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
            <Button
              size="lg"
              className="h-14 text-base shadow-lg bg-[#D4A017] hover:bg-[#B3840E] text-slate-900 font-semibold px-8"
              onClick={() => openAuth('client')}
            >
              Quero Contratar
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base bg-white/10 hover:bg-white/20 text-white border-white/30 font-semibold px-8"
              onClick={() => openAuth('pro')}
            >
              Quero Trabalhar
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
