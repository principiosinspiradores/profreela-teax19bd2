import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, type Role } from '@/hooks/use-auth'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { Briefcase } from 'lucide-react'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRole?: Role
}

export function AuthDialog({ open, onOpenChange, initialRole = 'client' }: AuthDialogProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    termsAccepted: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let result
      if (isLogin) {
        result = await signIn(formData.email, formData.password)
      } else {
        if (!formData.termsAccepted) {
          toast({
            title: 'Erro',
            description: 'Você deve aceitar os Termos e LGPD',
            variant: 'destructive',
          })
          setLoading(false)
          return
        }
        result = await signUp({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: initialRole,
          terms_accepted: formData.termsAccepted,
          status: initialRole === 'pro' ? 'pending' : 'active',
        })
      }

      if (result.error) {
        toast({
          title: 'Erro na autenticação',
          description: getErrorMessage(result.error),
          variant: 'destructive',
        })
      } else {
        onOpenChange(false)
        if (initialRole === 'pro') navigate('/pro')
        else if (initialRole === 'client') navigate('/client')
        else if (initialRole === 'admin') navigate('/admin')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
            <Briefcase className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-2xl">
            {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {initialRole === 'pro' ? 'Portal do Profissional' : 'Portal da Empresa'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                required
                placeholder="João da Silva"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="seu@email.com"
              value={formData.email}
              onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
            />
          </div>

          {!isLogin && (
            <div className="flex flex-row items-start space-x-3 space-y-0 p-2">
              <Checkbox
                id="terms"
                checked={formData.termsAccepted}
                onCheckedChange={(c) => setFormData((f) => ({ ...f, termsAccepted: !!c }))}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="terms" className="text-xs">
                  Aceito os Termos de Uso e Política de Privacidade (LGPD)
                </Label>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full text-md h-12" disabled={loading}>
            {loading ? 'Aguarde...' : isLogin ? 'Entrar na plataforma' : 'Cadastrar agora'}
          </Button>

          <div className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? 'Não tem uma conta? ' : 'Já possui conta? '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? 'Cadastre-se' : 'Faça login'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
