import { useRef, useState } from 'react'
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
import { getErrorMessage, extractFieldErrors, type FieldErrors } from '@/lib/pocketbase/errors'
import { Camera, Upload, User } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { getAvatarUrl } from '@/lib/avatar'
import { BrandLogo } from '@/components/BrandLogo'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>('')

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    termsAccepted: false,
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Selecione um arquivo de imagem (JPG, PNG, etc.).',
        variant: 'destructive',
      })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'A imagem deve ter no máximo 5MB.',
        variant: 'destructive',
      })
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const clearAvatar = () => {
    setAvatarFile(null)
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Reset avatar state whenever the dialog toggles between login/signup or
  // closes, so stale previews don't leak across sessions.
  const handleModeSwitch = () => {
    clearAvatar()
    setIsLogin(!isLogin)
  }

  const handleClose = (open: boolean) => {
    if (!open) clearAvatar()
    onOpenChange(open)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    setFieldErrors({})
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
          avatar: initialRole === 'pro' ? avatarFile : undefined,
        })
      }

      if (result.error) {
        setFieldErrors(extractFieldErrors(result.error))
        toast({
          title: 'Erro na autenticação',
          description: getErrorMessage(result.error),
          variant: 'destructive',
        })
      } else {
        handleClose(false)
        // Redirect based on the user's ACTUAL role, not the selected dialog role.
        // This ensures an admin who logs in via the client/pro dialog still
        // lands on /admin, a pro lands on /pro, etc.
        const role = (pb.authStore.record as any)?.role as Role | undefined
        if (role === 'admin') navigate('/admin')
        else if (role === 'pro') navigate('/pro')
        else if (role === 'client') navigate('/client')
        else navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto flex items-center justify-center mb-3">
            <BrandLogo size="lg" />
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

          {/* Avatar upload — only for pros during signup */}
          {!isLogin && initialRole === 'pro' && (
            <div className="space-y-2">
              <Label htmlFor="avatar">Foto de perfil (opcional)</Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Pré-visualização do avatar"
                      className="w-16 h-16 rounded-full object-cover border-2 border-primary/30"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                      <User className="h-7 w-7 text-muted-foreground" />
                    </div>
                  )}
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={clearAvatar}
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow hover:bg-destructive/90"
                      aria-label="Remover foto"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    id="avatar"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <>
                        <Camera className="h-4 w-4 mr-2" /> Trocar foto
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" /> Enviar foto
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG ou PNG até 5MB. Os clientes verão sua foto ao contratar.
                  </p>
                </div>
              </div>
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
            {fieldErrors.email && <p className="text-sm text-red-500">{fieldErrors.email}</p>}
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
            {fieldErrors.password && <p className="text-sm text-red-500">{fieldErrors.password}</p>}
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

          <Button
            type="submit"
            className="w-full text-md h-12 bg-[#0D4F5C] hover:bg-[#08353E] text-white font-semibold"
            disabled={loading}
          >
            {loading ? 'Aguarde...' : isLogin ? 'Entrar na plataforma' : 'Cadastrar agora'}
          </Button>

          <div className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? 'Não tem uma conta? ' : 'Já possui conta? '}
            <button
              type="button"
              onClick={handleModeSwitch}
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
