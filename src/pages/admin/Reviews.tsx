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
import { Loader2, Star, Search, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { RatingStars } from '@/components/RatingStars'

type Review = {
  id: string
  job_id: string
  author_id: string
  recipient_id: string
  rating: number
  comment?: string
  created?: string
  updated?: string
  expand?: {
    author_id?: { id: string; name?: string; email?: string }
    recipient_id?: { id: string; name?: string; email?: string }
    job_id?: { id: string; address?: string }
  }
}

export default function AdminReviews() {
  const { toast } = useToast()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await pb.collection('reviews').getFullList({
        sort: '-created',
        expand: 'author_id,recipient_id,job_id',
      })
      setReviews(list as unknown as Review[])
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar avaliações',
        description: err?.message || 'Não foi possível obter as avaliações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (review: Review) => {
    if (!confirm('Excluir esta avaliação? Esta ação não pode ser desfeita.')) return
    setDeletingId(review.id)
    try {
      await pb.collection('reviews').delete(review.id)
      setReviews((prev) => prev.filter((r) => r.id !== review.id))
      toast({
        title: 'Avaliação excluída',
        description: 'A avaliação foi removida da plataforma.',
        variant: 'default',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Não foi possível excluir a avaliação.',
        variant: 'destructive',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = reviews.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const author = r.expand?.author_id?.name || r.expand?.author_id?.email || ''
    const recipient = r.expand?.recipient_id?.name || r.expand?.recipient_id?.email || ''
    return (
      author.toLowerCase().includes(q) ||
      recipient.toLowerCase().includes(q) ||
      (r.comment || '').toLowerCase().includes(q)
    )
  })

  const counts = {
    total: reviews.length,
    avg:
      reviews.length > 0
        ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length
        : 0,
    low: reviews.filter((r) => Number(r.rating) <= 2).length,
    high: reviews.filter((r) => Number(r.rating) >= 4).length,
  }

  const fmtDate = (iso?: string) => {
    if (!iso) return '-'
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Avaliações</h1>
        <p className="text-muted-foreground">
          Moderar todas as avaliações da plataforma. Os profissionais não veem esta seção — apenas a
          nota média permanece em seus perfis públicos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Média geral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {counts.avg.toFixed(1).replace('.', ',')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Positivas (≥4)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{counts.high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Críticas (≤2)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{counts.low}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Moderação de Avaliações
          </CardTitle>
          <CardDescription>
            Avaliações recebidas pelos profissionais. Exclua avaliações inadequadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, profissional ou comentário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando avaliações...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma avaliação encontrada.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Comentário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.expand?.author_id?.name || r.expand?.author_id?.email || '-'}
                      </TableCell>
                      <TableCell>
                        {r.expand?.recipient_id?.name || r.expand?.recipient_id?.email || '-'}
                      </TableCell>
                      <TableCell>
                        <RatingStars avg={Number(r.rating)} count={0} showCount={false} />
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {r.comment ? (
                          <span className="line-clamp-2">{r.comment}</span>
                        ) : (
                          <span className="italic text-muted-foreground/60">Sem comentário</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.created)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === r.id}
                          onClick={() => handleDelete(r)}
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Excluir
                        </Button>
                      </TableCell>
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
