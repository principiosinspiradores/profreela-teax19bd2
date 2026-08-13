import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Star } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getClientJobs } from '@/services/api'
import { getReviewsByAuthor, type Review } from '@/services/reviews'
import { RatingStars } from '@/components/RatingStars'
import { ReviewDialog } from '@/components/ReviewDialog'
import { format } from 'date-fns'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'

export default function ClientHistory() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<any[]>([])
  const [reviewsByJob, setReviewsByJob] = useState<Record<string, Review>>({})
  const [reviewJob, setReviewJob] = useState<any>(null)

  const load = () => {
    if (!user) return
    Promise.all([getClientJobs(user.id), getReviewsByAuthor(user.id).catch(() => [])]).then(
      ([res, reviews]) => {
        setJobs(res.filter((j) => ['completed', 'cancelled'].includes(j.status)))
        const map: Record<string, Review> = {}
        ;(reviews as any[]).forEach((r) => {
          map[r.job_id] = r
        })
        setReviewsByJob(map)
      },
    )
  }

  useEffect(() => {
    load()
  }, [user])

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Serviços</h1>
        <p className="text-muted-foreground">
          Consulte serviços anteriores e baixe recibos/notas fiscais.
        </p>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Profissional</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-center">Avaliação</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const review = reviewsByJob[job.id]
              const reviewed = !!review
              const canReview = job.status === 'completed' && (job.expand?.pro_id || job.pro_id)
              return (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">#{job.id.slice(0, 6)}</TableCell>
                  <TableCell>{format(new Date(job.created), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{job.expand?.service_id?.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">{job.expand?.pro_id?.name || '-'}</div>
                  </TableCell>
                  <TableCell>{job.hours ? `${job.hours}h` : '-'}</TableCell>
                  <TableCell>
                    {job.status === 'completed' ? (
                      <Badge
                        variant="outline"
                        className="bg-secondary/10 text-secondary border-secondary/20"
                      >
                        Concluído
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-destructive/10 text-destructive border-destructive/20"
                      >
                        Cancelado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge state={job} />
                  </TableCell>
                  <TableCell className="text-right">R$ {job.price.toFixed(2)}</TableCell>
                  <TableCell className="align-top">
                    {reviewed ? (
                      <div className="space-y-1 min-w-[160px]">
                        <RatingStars avg={review.rating} count={0} showCount={false} size="sm" />
                        {review.comment && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            “{review.comment}”
                          </p>
                        )}
                      </div>
                    ) : canReview ? (
                      <span className="text-xs text-amber-700">Pendente</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {canReview && (
                        <Button
                          variant={reviewed ? 'ghost' : 'outline'}
                          size="icon"
                          title={reviewed ? 'Avaliado' : 'Avaliar profissional'}
                          disabled={reviewed}
                          onClick={() => setReviewJob(job)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Baixar Recibo"
                        disabled={job.status !== 'completed'}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Nenhum histórico encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ReviewDialog
        job={reviewJob}
        open={!!reviewJob}
        onOpenChange={(o) => !o && setReviewJob(null)}
        onReviewed={load}
      />
    </div>
  )
}
