import { useState, useEffect } from 'react'
import { User, Loader2, Save, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { updateUser } from '@/services/api'
import { RatingStars } from '@/components/RatingStars'
import { getAvatarUrl } from '@/lib/avatar'

export default function ProSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone || '')
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await updateUser(user.id, { name, phone })
      toast({ title: 'Perfil atualizado', description: 'Suas informações foram salvas.' })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível salvar.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const avg = Number(user?.rating_avg || 0)
  const count = Number(user?.rating_count || 0)

  return (
    <div className="space-y-8 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil público e veja suas avaliações.</p>
      </div>

      {/* Profile summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Perfil
          </CardTitle>
          <CardDescription>Como os clientes veem você na plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={getAvatarUrl(user, 128)}
              alt="Avatar"
              className="w-16 h-16 rounded-full border bg-muted object-cover"
            />
            <div className="space-y-1">
              <p className="font-semibold text-lg">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <RatingStars avg={avg} count={count} size="md" />
            </div>
          </div>

          {user?.suspended && (
            <div className="flex items-start gap-2 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
              <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Conta suspensa</p>
                <p>
                  Sua conta está suspensa por excesso de cancelamentos ou notas baixas. Entre em
                  contato com o suporte para reativação.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pro-name">Nome</Label>
              <Input id="pro-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pro-phone">Telefone</Label>
              <Input
                id="pro-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Salvar alterações
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground text-center">
        Suas avaliações recebidas são moderadas pela administração. A sua nota média continua
        visível no seu perfil público.
      </p>
    </div>
  )
}
