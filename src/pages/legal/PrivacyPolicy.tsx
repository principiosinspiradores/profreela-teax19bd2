import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Home } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'

// Dados cadastrais placeholder — o admin pode editar posteriormente.
const COMPANY = {
  legalName: 'ProFreela Tecnologia Ltda.',
  cnpj: '00.000.000/0001-00',
  address: 'Av. Paulista, 1000, Bela Vista — São Paulo/SP, CEP 01310-100',
  dpoName: 'Departamento de Proteção de Dados (DPO)',
  dpoEmail: 'dpo@profreela.com.br',
  privacyEmail: 'privacidade@profreela.com.br',
}

const SECTIONS = [
  {
    id: 'controlador',
    title: '1. Controlador dos dados',
    body: (
      <div className="space-y-3">
        <p>
          O tratamento de dados pessoais na plataforma ProFreela é realizado por{' '}
          <strong>{COMPANY.legalName}</strong>, inscrita no CNPJ sob nº {COMPANY.cnpj}, com sede na{' '}
          {COMPANY.address}, na qualidade de controladora (art. 5º, VI, LGPD).
        </p>
        <p>
          Encarregado pelo Tratamento de Dados Pessoais (DPO): {COMPANY.dpoName}, que pode ser
          contatado pelo e-mail{' '}
          <a className="text-primary underline" href={`mailto:${COMPANY.dpoEmail}`}>
            {COMPANY.dpoEmail}
          </a>
          .
        </p>
        <p className="text-sm text-muted-foreground italic">
          Observação: os dados cadastrais acima são placeholders e serão substituídos pelos dados
          oficiais antes da publicação.
        </p>
      </div>
    ),
  },
  {
    id: 'dados-coletados',
    title: '2. Dados coletados',
    body: (
      <div className="space-y-3">
        <p>Para viabilizar a intermediação de serviços, o ProFreela coleta os seguintes dados:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Identificação: nome completo e CPF (e CNPJ para clientes empresariais);</li>
          <li>Contato: e-mail e telefone;</li>
          <li>Endereço de prestação do serviço;</li>
          <li>Fotografias: foto de perfil e fotos de serviço (antes/depois);</li>
          <li>Localização GPS no momento da solicitação e da execução do serviço;</li>
          <li>
            Dados de pagamento (processados por parceiros — não armazenamos o número do cartão);
          </li>
          <li>Avaliações e histórico de serviços realizados;</li>
          <li>Dados de acesso: endereço IP, device e cookies.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'finalidade',
    title: '3. Finalidade do tratamento',
    body: (
      <div className="space-y-3">
        <p>O tratamento dos dados tem as seguintes finalidades e bases legais (art. 7º, LGPD):</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Execução de contrato</strong> (art. 7º, V): viabilizar a intermediação de
            serviços entre clientes e profissionais;
          </li>
          <li>
            <strong>Obrigação legal/regulatória</strong> (art. 7º, II): cumprimento de exigências
            fiscais, contábeis e legais;
          </li>
          <li>
            <strong>Legítimo interesse</strong> (art. 7º, IX): segurança, prevenção a fraudes,
            melhoria contínua da plataforma e comunicação essencial aos usuários;
          </li>
          <li>
            Processar pagamentos, confirmar identidade, gerar comprovantes e prevenir fraudes.
          </li>
        </ul>
        <p>
          O tratamento é sempre limitado à finalidade informada, em estrita observância aos
          princípios do art. 6º da LGPD.
        </p>
      </div>
    ),
  },
  {
    id: 'compartilhamento',
    title: '4. Compartilhamento de dados',
    body: (
      <div className="space-y-3">
        <p>Os dados podem ser compartilhados, estritamente na medida do necessário, com:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Processadores de pagamento</strong> (Mercado Pago), para processar transações e
            cumprir obrigações financeiras;
          </li>
          <li>
            <strong>Serviços de nuvem</strong> (Skip Cloud), para hospedagem e armazenamento da
            aplicação;
          </li>
          <li>
            <strong>Google Maps</strong>, para geolocalização do endereço e roteamento;
          </li>
          <li>Autoridades públicas, quando determinado por lei ou ordem judicial.</li>
        </ul>
        <p className="font-medium">
          O ProFreela <strong>não comercializa nem vende</strong> dados pessoais dos usuários, sob
          nenhuma hipótese.
        </p>
      </div>
    ),
  },
  {
    id: 'direitos-titular',
    title: '5. Direitos do titular (art. 18, LGPD)',
    body: (
      <div className="space-y-3">
        <p>Como titular dos dados, você tem direito a:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Confirmar a existência de tratamento e acessar os seus dados;</li>
          <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimizar, bloquear ou eliminar dados desnecessários ou excessivos;</li>
          <li>Portabilidade dos dados a outro fornecedor de serviço equivalente;</li>
          <li>Eliminar os dados pessoais tratados com consentimento, salvo exceções legais;</li>
          <li>Revogar o consentimento previamente prestado;</li>
          <li>
            Revisão de decisões automatizadas que afetem seus interesses, inclusive perfis de
            personalidade, profissionais, de consumo ou de crédito.
          </li>
        </ul>
        <p>
          Para exercer qualquer um desses direitos, utilize o canal indicado na seção 10 (Canal
          LGPD).
        </p>
      </div>
    ),
  },
  {
    id: 'seguranca',
    title: '6. Segurança',
    body: (
      <div className="space-y-3">
        <p>O ProFreela adota medidas técnicas e organizacionais de segurança, incluindo:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Criptografia de dados em trânsito (TLS) e em repouso;</li>
          <li>Acesso restrito aos dados, em base funcional e need-to-know;</li>
          <li>Monitoramento de acessos e logs de atividade;</li>
          <li>
            Notificação ao titular e à ANPD em caso de incidente de segurança que possa acarretar
            risco ou dano (art. 48, LGPD).
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'cookies',
    title: '7. Cookies',
    body: (
      <div className="space-y-3">
        <p>O ProFreela utiliza cookies para as seguintes finalidades:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Autenticação</strong>: manter o usuário conectado e a sessão segura;
          </li>
          <li>
            <strong>Preferências</strong>: lembrar idioma e configurações de exibição;
          </li>
          <li>
            <strong>Analytics</strong>: entender como a plataforma é utilizada para melhorias
            (anonimizados quando possível).
          </li>
        </ul>
        <p>
          Você pode gerenciar cookies nas configurações do seu navegador, embora algumas
          funcionalidades possam deixar de funcionar ao desativá-los.
        </p>
      </div>
    ),
  },
  {
    id: 'retencao',
    title: '8. Retenção de dados',
    body: (
      <p>
        Os dados pessoais são mantidos por <strong>[5 (cinco) anos]</strong> após o último uso ou o
        encerramento da conta, exceto quando a legislação (fiscal, contábil, consumerista) exigir
        prazo superior, ou quando necessários para a defesa de direitos em juízo. Após esse prazo,
        os dados são anonimizados ou eliminados.
      </p>
    ),
  },
  {
    id: 'alteracoes',
    title: '9. Alterações nesta política',
    body: (
      <p>
        Podemos alterar esta Política de Privacidade. Eventuais alterações materiais serão
        comunicadas com <strong>15 (quinze) dias</strong> de antecedência pela plataforma ou por
        e-mail, conforme o art. 9º, § 2º, da LGPD.
      </p>
    ),
  },
  {
    id: 'canal-lgpd',
    title: '10. Canal LGPD',
    body: (
      <div className="space-y-3">
        <p>
          Para requisições de privacidade, exercício de direitos do titular ou reclamações
          relacionadas ao tratamento de dados, utilize o canal específico:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            E-mail:{' '}
            <a className="text-primary underline" href={`mailto:${COMPANY.privacyEmail}`}>
              {COMPANY.privacyEmail}
            </a>
          </li>
          <li>
            Encarregado (DPO): {COMPANY.dpoName} —{' '}
            <a className="text-primary underline" href={`mailto:${COMPANY.dpoEmail}`}>
              {COMPANY.dpoEmail}
            </a>
          </li>
          <li>
            Autoridade fiscalizadora: Autoridade Nacional de Proteção de Dados (ANPD), pelo site{' '}
            <a
              className="text-primary underline"
              href="https://www.gov.br/anpd"
              target="_blank"
              rel="noreferrer"
            >
              www.gov.br/anpd
            </a>
            .
          </li>
        </ul>
      </div>
    ),
  },
]

export default function PrivacyPolicy() {
  const [activeId, setActiveId] = useState<string>('')

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
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
            <Link to="/" className="hover:text-foreground">
              Início
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">Política de Privacidade</span>
          </nav>

          <div className="max-w-3xl mb-10 md:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
              <ShieldCheck className="h-3.5 w-3.5" /> LGPD
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Política de Privacidade
            </h1>
            <p className="text-muted-foreground">
              Última atualização: 1º de janeiro de 2025. Esta política descreve como o ProFreela
              coleta, usa e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção
              de Dados (Lei 13.709/2018) — arts. 6º, 7º, 11 e 18.
            </p>
          </div>

          <div className="grid lg:grid-cols-[240px_1fr] gap-10">
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
                <Link to="/termos" className="block hover:text-foreground underline">
                  Ver Termos de Uso →
                </Link>
              </div>
            </aside>

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
                Para exercer seus direitos de privacidade, escreva para{' '}
                <a className="text-primary underline" href={`mailto:${COMPANY.privacyEmail}`}>
                  {COMPANY.privacyEmail}
                </a>
                . Respondemos em até 15 (quinze) dias corridos, conforme o art. 19 da LGPD.
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
