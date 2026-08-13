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
import { getReviewsByAuthor } from '@/services/reviews'
import { ReviewDialog } from '@/components/ReviewDialog'
import { format } from 'date-fns'
import { PaymentStatusBadge } from '@/components/PaymentStatusBadge'

export default function ClientHistory() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<any[]>([])
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set())
  const [reviewJob, setReviewJob] = useState<any>(null)

  const load = () => {
    if (!user) return
    Promise.all([getClientJobs(user.id), getReviewsByAuthor(user.id).catch(() => [])]).then(
      ([res, reviews]) => {
        setJobs(res.filter((j) => ['completed', 'cancelled'].includes(j.status)))
        setReviewedJobIds(new Set(reviews.map((r: any) => r.job_id)))
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
              <TableHead className="text-center">Ações</TableHead>{' '}
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
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
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {job.status === 'completed' && (job.expand?.pro_id || job.pro_id) && (
                      <Button
                        variant={reviewedJobIds.has(job.id) ? 'ghost' : 'outline'}
                        size="icon"
                        title={reviewedJobIds.has(job.id) ? 'Avaliado' : 'Avaliar profissional'}
                        disabled={reviewedJobIds.has(job.id)}
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
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
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
