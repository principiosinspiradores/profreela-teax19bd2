import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText, Home } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

// Dados cadastrais da empresa operadora da plataforma.
const COMPANY = {
  legalName: 'Housekeeping Brasil Consultoria e Facilities Ltda.',
  cnpj: '65.342.542/0001-98',
  address:
    'Av. Doutor Julio Soares de Arruda, 480 — Parque São Quirino, Campinas/SP, CEP 13088-300',
  dpoName: 'Encarregado de Proteção de Dados (DPO)',
  dpoEmail: 'profreela@profreela.com.br',
  contactEmail: 'profreela@profreela.com.br',
  supportUrl: 'https://www.consumidor.gov.br',
}

const SECTIONS = [
  {
    id: 'quem-somos',
    title: '1. Quem somos',
    body: (
      <div className="space-y-3">
        <p>
          O ProFreela é operado por <strong>{COMPANY.legalName}</strong>, inscrita no CNPJ sob nº{' '}
          {COMPANY.cnpj}, com sede na {COMPANY.address}.
        </p>
        <p>
          Encarregado pelo tratamento de dados (DPO): {COMPANY.dpoName}, contato pelo e-mail{' '}
          <a className="text-primary underline" href={`mailto:${COMPANY.dpoEmail}`}>
            {COMPANY.dpoEmail}
          </a>
          .
        </p>
      </div>
    ),
  },
  {
    id: 'o-que-fazemos',
    title: '2. O que fazemos',
    body: (
      <p>
        O ProFreela é uma plataforma de intermediação que conecta clientes a profissionais
        operacionais independentes para serviços de facilities e mão de obra. Não somos empregadores
        — os profissionais são prestadores autônomos, sem vínculo empregatício com a plataforma ou
        entre si.
      </p>
    ),
  },
  {
    id: 'cadastro',
    title: '3. Cadastro',
    body: (
      <div className="space-y-3">
        <p>Para utilizar a plataforma, o usuário deve:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Ser maior de 18 (dezoito) anos e plenamente capaz;</li>
          <li>Fornecer dados verdadeiros, completos e atualizados;</li>
          <li>Apresentar documentos válidos e comprobatórios quando solicitado;</li>
          <li>
            Manter a confidencialidade e a segurança da sua senha, sendo responsável por todas as
            atividades realizadas com a sua conta;
          </li>
          <li>Manter apenas uma conta por CPF/CNPJ, sendo vedada a criação de múltiplas contas.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'uso-da-plataforma',
    title: '4. Uso da plataforma',
    body: (
      <div className="space-y-3">
        <p>É expressamente proibido utilizar a plataforma para:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Praticar ou tentar praticar qualquer tipo de fraude;</li>
          <li>Assediar, ameaçar ou constranger outros usuários;</li>
          <li>Discriminar pessoas por qualquer critério (raça, gênero, idade, religião, etc.);</li>
          <li>
            Contatar profissional ou cliente por fora da plataforma com a finalidade de
            desintermediação (burlar a plataforma);
          </li>
          <li>Fornecer informações falsas ou enganosas;</li>
          <li>Utilizar a plataforma para fins ilícitos ou que violem direitos de terceiros.</li>
        </ul>
        <p>
          O descumprimento de qualquer destas proibições sujeita o usuário à{' '}
          <strong>suspensão permanente</strong> da plataforma, sem prejuízo das medidas legais
          cabíveis.
        </p>
      </div>
    ),
  },
  {
    id: 'pagamentos',
    title: '5. Pagamentos',
    body: (
      <div className="space-y-3">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Todos os pagamentos devem ser intermediados pela plataforma. Os preços são definidos no
            aplicativo no momento da contratação;
          </li>
          <li>
            Pode ser cobrada taxa de cancelamento quando o cliente desiste do serviço após a
            aceitação pelo profissional, conforme política exibida no app;
          </li>
          <li>
            Política de reembolso: reembolsamos integralmente o cliente quando o serviço não é
            iniciado por culpa do profissional; reembolsos parciais podem ocorrer em casos de
            interrupção, conforme análise do suporte;
          </li>
          <li>
            O pagamento fica em <strong>escrow (custódia) por 24 horas</strong> após a conclusão do
            serviço antes de ser repassado ao profissional, para garantia das partes;
          </li>
          <li>
            É <strong>proibido o pagamento por fora</strong> da plataforma (direto entre cliente e
            profissional). Essa conduta configura desintermediação e enseja suspensão da conta.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'obrigacoes-cliente',
    title: '6. Obrigações do cliente',
    body: (
      <div className="space-y-3">
        <ul className="list-disc pl-6 space-y-2">
          <li>Fornecer informações verdadeiras e detalhadas sobre o serviço solicitado;</li>
          <li>Garantir acesso adequado ao local de prestação do serviço;</li>
          <li>Não discriminar os profissionais, sob qualquer pretexto;</li>
          <li>Realizar o pagamento pontualmente, pelos meios disponibilizados na plataforma.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'obrigacoes-profissional',
    title: '7. Obrigações do profissional',
    body: (
      <div className="space-y-3">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Comparecer no horário acordado, com tolerância de <strong>15 (quinze) minutos</strong>;
          </li>
          <li>Prestar o serviço com qualidade e zelo;</li>
          <li>Respeitar o Código de Conduta do ProFreela e as normas do cliente;</li>
          <li>Portar documentos e equipamentos necessários à execução do serviço;</li>
          <li>
            Responsabilizar-se por danos causados ao cliente ou a terceiros por{' '}
            <strong>negligência comprovada</strong> na execução do serviço.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'avaliacoes',
    title: '8. Avaliações',
    body: (
      <div className="space-y-3">
        <p>
          A plataforma conta com um sistema de avaliação (rating) bidirecional, no qual clientes
          avaliam profissionais e vice-versa.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            É proibido publicar avaliações falsas, vingativas ou compradas; a manipulação do sistema
            de avaliações enseja suspensão;
          </li>
          <li>
            Todo usuário avaliado tem <strong>direito de resposta</strong>, podendo comentar a
            avaliação recebida em até 30 (trinta) dias.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'propriedade-intelectual',
    title: '9. Propriedade intelectual',
    body: (
      <div className="space-y-3">
        <p>
          As marcas, logotipos, nomes comerciais, código-fonte, design e demais elementos da
          plataforma são de propriedade exclusiva do ProFreela, protegidos pela legislação vigente.
        </p>
        <p>
          O conteúdo enviado pelos usuários (fotos de perfil, fotos de serviço, descrições) é
          licenciado ao ProFreela, gratuitamente, para utilização dentro da plataforma e fins
          relacionados à intermediação do serviço.
        </p>
      </div>
    ),
  },
  {
    id: 'limitacao-responsabilidade',
    title: '10. Limitação de responsabilidade',
    body: (
      <p>
        A plataforma é <strong>mera intermediadora</strong>. Não nos responsabilizamos por danos
        decorrentes da execução do serviço, atrasos, ou conduta de profissionais/clientes. O serviço
        é oferecido <strong>"como está"</strong> e <strong>"conforme disponível"</strong>, sem
        qualquer garantia implícita ou explícita.
      </p>
    ),
  },
  {
    id: 'seguro',
    title: '11. Seguro',
    body: (
      <p>
        Atualmente o ProFreela recomenda que os profissionais contratem seguro próprio de
        responsabilidade civil profissional e de acidentes pessoais. O ProFreela está em processo de
        contratação de apólice coletiva para seus profissionais cadastrados.
      </p>
    ),
  },
  {
    id: 'resolucao-conflitos',
    title: '12. Resolução de conflitos',
    body: (
      <div className="space-y-3">
        <p>Em caso de divergência, as partes observarão a seguinte ordem:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Atendimento pelo chat do aplicativo / suporte do ProFreela;</li>
          <li>
            Reclamação no portal{' '}
            <a
              className="text-primary underline"
              href={COMPANY.supportUrl}
              target="_blank"
              rel="noreferrer"
            >
              consumidor.gov.br
            </a>
            ;
          </li>
          <li>Foro do domicílio do consumidor.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'alteracoes',
    title: '13. Alterações',
    body: (
      <p>
        Podemos alterar estes termos a qualquer momento. O uso continuado da plataforma após a
        divulgação das alterações implica a aceitação tácita dos termos atualizados.
      </p>
    ),
  },
  {
    id: 'foro',
    title: '14. Foro',
    body: (
      <p>
        Fica eleito o foro da comarca de Campinas, Estado de São Paulo, para dirimir quaisquer
        questões relativas a estes Termos de Uso, ressalvada a competência dos Juizados Especiais
        Cíveis e a legislação consumerista aplicável.
      </p>
    ),
  },
]

export default function TermsOfService() {
  const [activeId, setActiveId] = useState<string>('')

  // Smooth-scroll the ToC links and highlight the active section.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        })
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const handleNav = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-xs">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center">
            <BrandLogo size="md" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="container py-12 md:py-16">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
            <Link to="/" className="hover:text-foreground">
              Início
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">Termos de Uso</span>
          </nav>

          {/* Title */}
          <div className="max-w-3xl mb-10 md:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
              <FileText className="h-3.5 w-3.5" /> Documento legal
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">Termos de Uso</h1>
            <p className="text-muted-foreground">
              Última atualização: 1º de janeiro de 2025. Estes termos regem o uso da plataforma
              ProFreela, em conformidade com o Marco Civil da Internet (Lei 12.965/2014), a LGPD
              (Lei 13.709/2018) e o Código de Defesa do Consumidor.
            </p>
          </div>

          {/* Body: ToC + content */}
          <div className="grid lg:grid-cols-[240px_1fr] gap-10">
            {/* Table of contents */}
            <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Sumário
              </p>
              <nav className="flex flex-col gap-1">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={(e) => handleNav(e, s.id)}
                    className={`text-sm rounded-md px-2 py-1.5 transition-colors border-l-2 ${
                      activeId === s.id
                        ? 'text-foreground font-medium border-primary bg-primary/5'
                        : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
              <div className="mt-6 pt-6 border-t text-xs text-muted-foreground space-y-1">
                <Link to="/privacidade" className="block hover:text-foreground underline">
                  Ver Política de Privacidade →
                </Link>
              </div>
            </aside>

            {/* Sections */}
            <article className="max-w-3xl">
              {SECTIONS.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24 mb-10">
                  <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3">
                    {s.title}
                  </h2>
                  <div className="text-[15px] md:text-base leading-relaxed text-foreground/90 space-y-3">
                    {s.body}
                  </div>
                </section>
              ))}

              <div className="mt-12 p-6 rounded-xl bg-muted/40 border text-sm text-muted-foreground">
                Em caso de dúvidas sobre estes Termos de Uso, entre em contato pelo e-mail{' '}
                <a className="text-primary underline" href={`mailto:${COMPANY.contactEmail}`}>
                  {COMPANY.contactEmail}
                </a>
                .
              </div>
            </article>
          </div>
        </div>
      </main>

      <footer className="border-t bg-muted/30">
        <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandLogo size="sm" />
            <span>© {new Date().getFullYear()} ProFreela. Todos os direitos reservados.</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/termos" className="hover:text-foreground underline">
              Termos
            </Link>
            <Link to="/privacidade" className="hover:text-foreground underline">
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
