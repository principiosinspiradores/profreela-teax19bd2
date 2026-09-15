import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandLogo } from '@/components/BrandLogo'
import { useToast } from '@/hooks/use-toast'
import type { Role } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { AlertCircle, CheckCircle2, Home, KeyRound, Lock } from 'lucide-react'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  // PocketBase default reset email template supplies ?token=... (and often ?email=... or user can supply)
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const emailParam = useMemo(() => searchParams.get('email') || '', [searchParams])

  const [email, setEmail] = useState(emailParam)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [invalidTokenError, setInvalidTokenError] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setInvalidTokenError(false)

    const errors: Record<string, string> = {}

    if (!token) {
      setInvalidTokenError(true)
      return
    }

    if (!email.trim()) {
      errors.email = 'Informe seu e-mail.'
    }

    if (!password) {
      errors.password = 'Informe a nova senha.'
    } else if (password.length < 8) {
      errors.password = 'A senha deve ter no mínimo 8 caracteres.'
    }

    if (!passwordConfirm) {
      errors.passwordConfirm = 'Confirme a nova senha.'
    } else if (password !== passwordConfirm) {
      errors.passwordConfirm = 'As senhas não coincidem.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setLoading(true)
    try {
      // confirmPasswordReset(token, password, passwordConfirm)
      // PocketBase JS SDK: confirmPasswordReset(token, password, passwordConfirm)
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)

      toast({
        title: 'Senha redefinida com sucesso!',
        description: 'Faça login com a sua nova senha.',
      })
      setSuccess(true)

      // Try automatic login or redirect to home with auth
      try {
        await pb.collection('users').authWithPassword(email.trim(), password)
        const role = (pb.authStore.record as any)?.role as Role | undefined
        if (role === 'admin') navigate('/admin')
        else if (role === 'pro') navigate('/pro')
        else if (role === 'client') navigate('/client')
        else navigate('/')
      } catch {
        // If auto-login fails, redirect to root where user can log in via AuthDialog
        navigate('/')
      }
    } catch (err: any) {
      console.error('Erro ao confirmar redefinição de senha:', err)
      const status = err?.status ?? err?.response?.status
      if (status === 400 || err?.data?.token || err?.message?.toLowerCase?.()?.includes('token')) {
        setInvalidTokenError(true)
      } else {
        toast({
          title: 'Erro ao redefinir senha',
          description:
            err?.message ||
            'Não foi possível redefinir a senha agora. Tente novamente em instantes.',
          variant: 'destructive',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur shadow-xs">
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

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <Card className="shadow-lg border-border">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-1">
                <KeyRound className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">Redefinir senha</CardTitle>
              <CardDescription>
                Defina sua nova senha de acesso à plataforma ProFreela.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!token || invalidTokenError ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg text-foreground">
                      Link inválido ou expirado
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Este link é inválido ou já expirou. Solicite um novo link de recuperação na
                      tela de login.
                    </p>
                  </div>
                  <Button
                    asChild
                    className="w-full text-md h-12 bg-[#0D4F5C] hover:bg-[#08353E] text-white font-semibold mt-2"
                  >
                    <Link to="/">Voltar para o início</Link>
                  </Button>
                </div>
              ) : success ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg text-foreground">
                      Senha alterada com sucesso!
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Redirecionando para a sua conta...
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Se o e-mail não veio na URL, solicita para garantir o login automático pós-reset */}
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">E-mail da sua conta</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || !!emailParam}
                    />
                    {fieldErrors.email && (
                      <p className="text-sm text-red-500">{fieldErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type="password"
                        required
                        placeholder="Mínimo de 8 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      <Lock className="h-4 w-4 absolute right-3 top-3 text-muted-foreground pointer-events-none" />
                    </div>
                    {fieldErrors.password && (
                      <p className="text-sm text-red-500">{fieldErrors.password}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type="password"
                        required
                        placeholder="Digite a mesma senha"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        disabled={loading}
                      />
                      <Lock className="h-4 w-4 absolute right-3 top-3 text-muted-foreground pointer-events-none" />
                    </div>
                    {fieldErrors.passwordConfirm && (
                      <p className="text-sm text-red-500">{fieldErrors.passwordConfirm}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full text-md h-12 bg-[#0D4F5C] hover:bg-[#08353E] text-white font-semibold"
                    disabled={loading}
                  >
                    {loading ? 'Salvando...' : 'Redefinir senha'}
                  </Button>

                  <div className="text-center pt-2">
                    <Link
                      to="/"
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                    >
                      Voltar para o início
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-muted/30">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandLogo size="sm" />
            <span>© {new Date().getFullYear()} ProFreela. Todos os direitos reservados.</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/termos" className="hover:text-foreground underline">
              Termos de Uso
            </Link>
            <Link to="/privacidade" className="hover:text-foreground underline">
              Política de Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
