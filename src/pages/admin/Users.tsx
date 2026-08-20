import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Users as UsersIcon,
  ShieldOff,
  ShieldCheck,
  Search,
  Ban,
  RotateCcw,
  Star,
  Phone,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getUsers, updateUser } from '@/services/api'
import { formatPhoneNumber } from '@/lib/phone'

type Role = 'admin' | 'pro' | 'client'
type Status = 'active' | 'pending' | 'blocked'

const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  pro: 'Profissional',
  client: 'Cliente',
}

const statusVariant: Record<Status, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  pending: 'secondary',
  blocked: 'destructive',
}

const statusLabel: Record<Status, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  blocked: 'Bloqueado',
}

export default function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const load = async () => {
    try {
      const list = await getUsers()
      list.sort((a: any, b: any) => (a.created < b.created ? 1 : -1))
      setUsers(list)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar usuários',
        description: err?.message || 'Não foi possível obter a lista de usuários.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const refreshOne = (updated: any) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
  }

  const handleChangeRole = async (user: any, role: Role) => {
    setUpdatingId(user.id)
    try {
      const updated = await updateUser(user.id, { role })
      refreshOne({ ...user, role: updated.role || role })
      toast({
        title: 'Perfil atualizado',
        description: `${user.name || user.email} agora é ${roleLabel[role]}.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar perfil',
        description: err?.message || 'Não foi possível atualizar o perfil.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleToggleBlock = async (user: any) => {
    const next: Status = user.status === 'blocked' ? 'active' : 'blocked'
    setUpdatingId(user.id)
    try {
      const updated = await updateUser(user.id, { status: next })
      refreshOne({ ...user, status: updated.status || next })
      toast({
        title: next === 'blocked' ? 'Usuário bloqueado' : 'Usuário desbloqueado',
        description: `${user.name || user.email} foi ${next === 'blocked' ? 'bloqueado' : 'reativado'}.`,
        variant: next === 'blocked' ? 'destructive' : 'default',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar status',
        description: err?.message || 'Não foi possível atualizar o status.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleReactivateSuspended = async (user: any) => {
    setUpdatingId(user.id)
    try {
      const updated = await updateUser(user.id, { suspended: false })
      refreshOne({ ...user, suspended: updated.suspended ?? false })
      toast({
        title: 'Profissional reativado',
        description: `${user.name || user.email} pode voltar a aceitar serviços.`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao reativar',
        description: err?.message || 'Não foi possível reativar o profissional.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const counts = {
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    pending: users.filter((u) => u.status === 'pending').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
  }

  const fmtDate = (iso: string) => {
    if (!iso) return '-'
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch (_) {
      return iso
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">
          Gerencie usuários da plataforma, perfis e status de acesso.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bloqueados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.blocked}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-primary" /> Gestão de Usuários
          </CardTitle>
          <CardDescription>
            Bloqueie, desbloqueie ou altere o perfil (cliente, profissional, admin).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="pro">Profissional</SelectItem>
                <SelectItem value="client">Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando usuários...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Avaliação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {user.phone ? (
                          <span className="flex items-center gap-1 text-slate-700">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {formatPhoneNumber(user.phone)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleChangeRole(user, v as Role)}
                          disabled={updatingId === user.id}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="pro">Profissional</SelectItem>
                            <SelectItem value="client">Cliente</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {user.role === 'pro' ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Star
                              className={
                                'h-3.5 w-3.5 ' +
                                (Number(user.rating_avg) >= 3
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'fill-red-400 text-red-400')
                              }
                            />
                            {Number(user.rating_count) > 0
                              ? `${Number(user.rating_avg || 0)
                                  .toFixed(1)
                                  .replace('.', ',')} (${user.rating_count})`
                              : '-'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Badge variant={statusVariant[user.status as Status] || 'secondary'}>
                          {statusLabel[user.status as Status] || user.status || '-'}
                        </Badge>
                        {user.suspended && (
                          <Badge variant="destructive" className="ml-1">
                            <Ban className="h-3 w-3 mr-1" /> Suspenso
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {fmtDate(user.created)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {user.role === 'pro' && user.suspended && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === user.id}
                              onClick={() => handleReactivateSuspended(user)}
                            >
                              {updatingId === user.id ? (
                                <Loader2 className="h-4 w-4 mr-2" />
                              ) : (
                                <RotateCcw className="h-4 w-4 mr-2" />
                              )}
                              Reativar
                            </Button>
                          )}
                          <Button
                            variant={user.status === 'blocked' ? 'outline' : 'destructive'}
                            size="sm"
                            disabled={updatingId === user.id}
                            onClick={() => handleToggleBlock(user)}
                          >
                            {updatingId === user.id ? (
                              <Loader2 className="h-4 w-4 mr-2" />
                            ) : user.status === 'blocked' ? (
                              <ShieldCheck className="h-4 w-4 mr-2" />
                            ) : (
                              <ShieldOff className="h-4 w-4 mr-2" />
                            )}
                            {user.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                          </Button>
                        </div>
                      </TableCell>{' '}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
