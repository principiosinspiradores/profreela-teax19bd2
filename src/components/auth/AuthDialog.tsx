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
import { useAuthStore, Role } from '@/stores/useAuthStore'
import { Briefcase } from 'lucide-react'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRole?: Role
}

export function AuthDialog({ open, onOpenChange, initialRole = 'client' }: AuthDialogProps) {
  const [isLogin, setIsLogin] = useState(true)
  const { setRole } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRole(initialRole)
    onOpenChange(false)
    if (initialRole === 'pro') navigate('/pro')
    else if (initialRole === 'client') navigate('/client')
    else if (initialRole === 'admin') navigate('/admin')
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
              <Input id="name" required placeholder="João da Silva" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required />
          </div>

          <Button type="submit" className="w-full text-md h-12">
            {isLogin ? 'Entrar na plataforma' : 'Cadastrar agora'}
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
