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
  Edit2,
  Check,
  X,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { getUsers, updateUser } from '@/services/api'
import { formatPhoneNumber } from '@/lib/phone'
import { formatCPF, cleanDigits, validateCPF } from '@/services/payouts'

type Role = 'admin' | 'pro' | 'client'
type Status = 'active' | 'pending' | 'blocked' | 'deleted'

const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  pro: 'Profissional',
  client: 'Cliente',
}

const statusVariant: Record<Status, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  pending: 'secondary',
  blocked: 'destructive',
  deleted: 'outline',
}

const statusLabel: Record<Status, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  blocked: 'Bloqueado',
  deleted: 'Excluído',
}

export default function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('standard')
  const [editingCpfUser, setEditingCpfUser] = useState<any | null>(null)
  const [cpfInput, setCpfInput] = useState('')
  const [cpfError, setCpfError] = useState<string | null>(null)
  const [savingCpf, setSavingCpf] = useState(false)
  const [userToDelete, setUserToDelete] = useState<any | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)

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

  const handleOpenCpfModal = (user: any) => {
    setEditingCpfUser(user)
    setCpfInput(user.cpf ? formatCPF(user.cpf) : '')
    setCpfError(null)
  }

  const handleSaveCpf = async () => {
    if (!editingCpfUser) return
    const digits = cleanDigits(cpfInput)
    if (digits && !validateCPF(digits)) {
      setCpfError('CPF inválido. Verifique os dígitos.')
      return
    }

    setSavingCpf(true)
    setCpfError(null)
    try {
      const updated = await updateUser(editingCpfUser.id, { cpf: digits })
      refreshOne({ ...editingCpfUser, cpf: updated.cpf ?? digits })
      toast({
        title: 'CPF atualizado',
        description: `CPF de ${editingCpfUser.name || editingCpfUser.email} foi salvo com sucesso.`,
      })
      setEditingCpfUser(null)
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível atualizar o CPF.'
      setCpfError(msg)
      toast({
        title: 'Erro ao atualizar CPF',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSavingCpf(false)
    }
  }

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.cpf || '').includes(cleanDigits(q))
    const matchesRole = roleFilter === 'all' || u.role === roleFilter

    // Status filter:
    // - 'standard': hide 'deleted' users by default
    // - 'deleted': show ONLY deleted users
    // - 'all': show everyone
    let matchesStatus = true
    if (statusFilter === 'standard') {
      matchesStatus = u.status !== 'deleted'
    } else if (statusFilter === 'deleted') {
      matchesStatus = u.status === 'deleted'
    } else if (statusFilter !== 'all') {
      matchesStatus = u.status === statusFilter
    }

    return matchesSearch && matchesRole && matchesStatus
  })

  const handleSoftDelete = async () => {
    if (!userToDelete) return
    if (userToDelete.role === 'admin') {
      toast({
        title: 'Operação não permitida',
        description: 'Administradores não podem ser excluídos.',
        variant: 'destructive',
      })
      setUserToDelete(null)
      return
    }

    setDeletingUser(true)
    try {
      const updated = await updateUser(userToDelete.id, {
        status: 'deleted',
        suspended: true,
      })
      refreshOne({
        ...userToDelete,
        status: updated.status || 'deleted',
        suspended: true,
      })
      toast({
        title: 'Usuário excluído',
        description: `${userToDelete.name || userToDelete.email} foi marcado como excluído e suspenso.`,
      })
      setUserToDelete(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir usuário',
        description: err?.message || 'Não foi possível marcar o usuário como excluído.',
        variant: 'destructive',
      })
    } finally {
      setDeletingUser(false)
    }
  }

  const counts = {
    total: users.filter((u) => u.status !== 'deleted').length,
    active: users.filter((u) => u.status === 'active').length,
    pending: users.filter((u) => u.status === 'pending').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
    deleted: users.filter((u) => u.status === 'deleted').length,
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

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total (Válidos)</CardTitle>
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
        <Card
          className="cursor-pointer hover:border-slate-400 transition-colors"
          onClick={() => setStatusFilter(statusFilter === 'deleted' ? 'standard' : 'deleted')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Excluídos</span>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-600">{counts.deleted}</div>
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
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os papéis</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="pro">Profissional</SelectItem>
                <SelectItem value="client">Cliente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Padrão (sem excluídos)</SelectItem>
                <SelectItem value="all">Todos (inclui excluídos)</SelectItem>
                <SelectItem value="deleted">Somente Excluídos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="blocked">Bloqueados</SelectItem>
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
                    <TableHead>CPF</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Papel</TableHead>
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
                        <button
                          type="button"
                          onClick={() => handleOpenCpfModal(user)}
                          className="group inline-flex items-center gap-1 hover:text-primary transition-colors text-left"
                          title="Clique para editar o CPF"
                        >
                          {user.cpf ? (
                            <span>{formatCPF(user.cpf)}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Sem CPF</span>
                          )}
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        </button>
                      </TableCell>
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
                          disabled={updatingId === user.id || user.status === 'deleted'}
                        >
                          <SelectTrigger className="w-[140px]">
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
                          user.profile_complete ? (
                            <Badge
                              variant="outline"
                              className="text-emerald-700 bg-emerald-50 border-emerald-300 gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Completo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-amber-700 bg-amber-50 border-amber-300 gap-1"
                            >
                              <XCircle className="h-3 w-3" /> Incompleto
                            </Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
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
                          {user.role === 'pro' && user.suspended && user.status !== 'deleted' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === user.id || deletingUser}
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
                          {user.status !== 'deleted' ? (
                            <Button
                              variant={user.status === 'blocked' ? 'outline' : 'destructive'}
                              size="sm"
                              disabled={updatingId === user.id || deletingUser}
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
                          ) : (
                            <span className="text-xs text-muted-foreground self-center">
                              Conta desativada
                            </span>
                          )}
                          {user.role !== 'admin' && user.status !== 'deleted' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              disabled={updatingId === user.id || deletingUser}
                              onClick={() => setUserToDelete(user)}
                              title="Excluir usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only sm:not-sr-only sm:ml-1">Excluir</span>
                            </Button>
                          )}
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

      {/* Soft delete confirmation dialog */}
      <Dialog
        open={!!userToDelete}
        onOpenChange={(o) => {
          if (!o && !deletingUser) {
            setUserToDelete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir usuário?</DialogTitle>
            <DialogDescription>
              O usuário <strong>{userToDelete?.name || userToDelete?.email}</strong> será marcado
              como <code>excluído</code> e <code>suspenso</code>. O registro não é apagado
              fisicamente para preservar o histórico de pagamentos e auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-1">
            <p>• O usuário não conseguirá mais realizar login na plataforma.</p>
            <p>• O usuário deixará de receber ofertas e notificações.</p>
            <p>• Ele sumirá da listagem padrão (acessível pelo filtro "Excluídos").</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserToDelete(null)} disabled={deletingUser}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleSoftDelete} disabled={deletingUser}>
              {deletingUser ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit CPF Dialog */}
      <Dialog
        open={!!editingCpfUser}
        onOpenChange={(o) => {
          if (!o && !savingCpf) {
            setEditingCpfUser(null)
            setCpfError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar CPF do Usuário</DialogTitle>
            <DialogDescription>
              Atualize ou preencha o CPF de{' '}
              <strong>{editingCpfUser?.name || editingCpfUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="admin_user_cpf">CPF</Label>
              <Input
                id="admin_user_cpf"
                placeholder="000.000.000-00"
                value={cpfInput}
                maxLength={14}
                onChange={(e) => {
                  setCpfInput(formatCPF(e.target.value))
                  setCpfError(null)
                }}
                disabled={savingCpf}
                className={cpfError ? 'border-red-500' : ''}
              />
              {cpfError && <p className="text-xs text-red-500 font-medium">{cpfError}</p>}
              <p className="text-xs text-muted-foreground">
                Deixe em branco se o usuário não possuir CPF.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingCpfUser(null)
                setCpfError(null)
              }}
              disabled={savingCpf}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveCpf} disabled={savingCpf}>
              {savingCpf ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar CPF'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
