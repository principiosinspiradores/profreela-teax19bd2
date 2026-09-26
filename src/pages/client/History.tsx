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
import { Download, Star, Phone, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getClientJobs } from '@/services/api'
import { getReviewsByAuthor, type Review } from '@/services/reviews'
import { RatingStars } from '@/components/RatingStars'
import { ReviewDialog } from '@/components/ReviewDialog'
import { DisputeDialog } from '@/components/DisputeDialog'
import { format } from 'date-fns'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'
import { getProPhoneForClient, canClientViewRealPhone } from '@/lib/phone'

export default function ClientHistory() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<any[]>([])
  const [reviewsByJob, setReviewsByJob] = useState<Record<string, Review>>({})
  const [reviewJob, setReviewJob] = useState<any>(null)
  const [disputeJob, setDisputeJob] = useState<any>(null)

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

              // Janela de disputa pós-finalização de 24h
              const isCompleted = job.status === 'completed'
              const completedAtMs = job.completed_at ? new Date(job.completed_at).getTime() : 0
              const isWithin24h =
                isCompleted &&
                completedAtMs > 0 &&
                !isNaN(completedAtMs) &&
                Date.now() - completedAtMs < 24 * 60 * 60 * 1000
              const hasNoOpenDispute = job.payment_status !== 'disputed'
              const canDispute = isWithin24h && hasNoOpenDispute
              return (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">#{job.id.slice(0, 6)}</TableCell>
                  <TableCell>{format(new Date(job.created), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{job.expand?.service_id?.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{job.expand?.pro_id?.name || '-'}</span>
                      {job.expand?.pro_id?.phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {getProPhoneForClient(job.expand.pro_id.phone, job)}
                          {canClientViewRealPhone(job) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1 border-green-300 text-green-700 bg-green-50"
                            >
                              Liberado
                            </Badge>
                          )}
                        </span>
                      )}
                    </div>
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
                      {canDispute && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-700 border-amber-300 hover:bg-amber-50 h-8 px-2 text-xs gap-1"
                          title="Reportar problema dentro da janela de 24h"
                          onClick={() => setDisputeJob(job)}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Reportar problema
                        </Button>
                      )}
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

      <DisputeDialog
        jobId={disputeJob?.id ?? null}
        open={!!disputeJob}
        onOpenChange={(o) => !o && setDisputeJob(null)}
        onDisputed={load}
      />
    </div>
  )
}
