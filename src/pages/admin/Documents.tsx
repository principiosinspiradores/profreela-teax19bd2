import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { FileCheck2, FileText, FileX2, Search, Loader2, Users, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  approveDocument,
  documentFileUrl,
  docTypeLabel,
  getDocumentsByStatus,
  rejectDocument,
  type DocumentRecord,
} from '@/services/documents'
import { updateUser } from '@/services/api'
import { formatPhoneNumber } from '@/lib/phone'
import { getErrorMessage } from '@/lib/pocketbase/errors'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const STATUS_META: Record<
  StatusFilter,
  { label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pendente', badge: 'secondary' },
  approved: { label: 'Aprovado', badge: 'default' },
  rejected: { label: 'Rejeitado', badge: 'destructive' },
  all: { label: 'Todos', badge: 'outline' },
}

const fmtDate = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const isPdfFile = (fileName?: string) => (fileName || '').toLowerCase().includes('.pdf')

export default function AdminDocuments() {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rejectDoc, setRejectDoc] = useState<DocumentRecord | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [imageDialog, setImageDialog] = useState<{ url: string; name: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getDocumentsByStatus(filter)
      setDocs(list)
    } catch (err) {
      toast({
        title: 'Erro ao carregar documentos',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [filter, toast])

  useEffect(() => {
    load()
  }, [load])

  const docUserId = (doc: DocumentRecord): string =>
    typeof doc.user_id === 'string' ? doc.user_id : doc.user_id?.id || ''

  const docUserName = (doc: DocumentRecord): string => {
    const u = doc.expand?.user_id
    return u?.name || u?.email || 'Profissional'
  }

  const handleApprove = async (doc: DocumentRecord) => {
    setUpdatingId(doc.id)
    try {
      await approveDocument(doc.id)
      // First approval activates the pro's account ("verified" status).
      const u = doc.expand?.user_id
      if (u && u.status === 'pending') {
        try {
          await updateUser(u.id, { status: 'active' })
        } catch (_) {
          /* doc approval still succeeds; admin can activate in Users page */
        }
      }
      await load()
      toast({
        title: 'Documento aprovado',
        description: `${docUserName(doc)} liberado para receber serviços.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao aprovar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectDoc) return
    setUpdatingId(rejectDoc.id)
    try {
      await rejectDocument(rejectDoc.id, rejectNote)
      toast({
        title: 'Documento rejeitado',
        description: `${docUserName(rejectDoc)} deve reenviar o documento.`,
      })
      setRejectDoc(null)
      setRejectNote('')
      await load()
    } catch (err) {
      toast({
        title: 'Erro ao rejeitar',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter((d) => {
      const u = d.expand?.user_id
      const haystack = `${u?.name || ''} ${u?.email || ''} ${docTypeLabel(d.type)}`.toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [docs, search])

  const counts = useMemo(
    () => ({
      pending: docs.filter((d) => d.status === 'pending').length,
      approved: docs.filter((d) => d.status === 'approved').length,
      rejected: docs.filter((d) => d.status === 'rejected').length,
      total: docs.length,
    }),
    [docs],
  )

  const openViewer = (doc: DocumentRecord) => {
    const url = documentFileUrl(doc)
    if (!url) {
      toast({ title: 'Arquivo não encontrado', variant: 'destructive' })
      return
    }
    if (isPdfFile(doc.file)) {
      window.open(url, '_blank', 'noopener')
    } else {
      setImageDialog({ url, name: docUserName(doc) })
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Verificação de Documentos</h1>
        <p className="text-muted-foreground">
          Aprove ou rejeite os documentos enviados pelos profissionais. Ao aprovar o primeiro
          documento, a conta do profissional é ativada automaticamente.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" /> Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-green-600" /> Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileX2 className="h-4 w-4 text-red-500" /> Rejeitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.rejected}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentos enviados</CardTitle>
          <CardDescription>
            Abra o arquivo para conferir antes de aprovar. PDF abre em nova aba; imagens abrem em
            tela cheia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou tipo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
                <SelectItem value="all">Todos os status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando documentos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum documento encontrado para este filtro.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((doc) => {
                    const u = doc.expand?.user_id
                    const meta = STATUS_META[(doc.status as StatusFilter) || 'pending']
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{docUserName(doc)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u?.email || '—'}
                          {u?.phone ? (
                            <span className="block font-mono">{formatPhoneNumber(u.phone)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => openViewer(doc)}
                            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4" />
                            {docTypeLabel(doc.type)}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmtDate(doc.created)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta?.badge || 'secondary'}>
                            {meta?.label || doc.status}
                          </Badge>
                          {doc.reviewer_note ? (
                            <span className="block text-xs text-muted-foreground mt-1 max-w-[200px] truncate">
                              {doc.reviewer_note}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {doc.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                disabled={updatingId === doc.id}
                                onClick={() => handleApprove(doc)}
                              >
                                {updatingId === doc.id ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <FileCheck2 className="h-4 w-4 mr-1" />
                                )}
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={updatingId === doc.id}
                                onClick={() => setRejectDoc(doc)}
                              >
                                <FileX2 className="h-4 w-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Analisado {fmtDate(doc.reviewed_at)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectDoc} onOpenChange={(open) => !open && setRejectDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              Documento de <strong>{docUserName(rejectDoc as DocumentRecord)}</strong>. Explique o
              motivo — a orientação aparece para o profissional ao reenviar.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex.: Foto ilegível. Reenvie com boa iluminação e sem recortes."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDoc(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={updatingId !== null}>
              {updatingId !== null ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FileX2 className="h-4 w-4 mr-1" />
              )}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image viewer dialog */}
      <Dialog open={!!imageDialog} onOpenChange={(open) => !open && setImageDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documento — {imageDialog?.name}</DialogTitle>
            <DialogDescription>Confira a legibilidade antes de aprovar.</DialogDescription>
          </DialogHeader>
          {imageDialog && (
            <img
              src={imageDialog.url}
              alt="Documento enviado"
              className="w-full rounded-lg border object-contain max-h-[70vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
