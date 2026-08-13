import { useState } from 'react'
import { Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { createReview } from '@/services/reviews'
import { cn } from '@/lib/utils'

export function ReviewDialog({
  job,
  open,
  onOpenChange,
  onReviewed,
}: {
  job: any
  open: boolean
  onOpenChange: (o: boolean) => void
  onReviewed?: () => void
}) {
  const { toast } = useToast()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!job) return
    if (rating < 1 || rating > 5) {
      toast({
        title: 'Selecione uma nota',
        description: 'Escolha de 1 a 5 estrelas.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      await createReview(job.id, rating, comment)
      toast({
        title: 'Avaliação enviada',
        description: 'Obrigado por avaliar o profissional!',
      })
      onOpenChange(false)
      setRating(0)
      setHover(0)
      setComment('')
      onReviewed?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao avaliar',
        description: err?.message || 'Não foi possível registrar a avaliação.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" /> Avalie o Profissional
          </DialogTitle>
          <DialogDescription>
            Como foi o serviço de <strong>{job?.expand?.pro_id?.name || 'profissional'}</strong> em{' '}
            <strong>{job?.expand?.service_id?.name || 'serviço'}</strong>?
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <div className="space-y-2">
            <Label>Nota</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1"
                  aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                >
                  <Star
                    className={cn(
                      'h-8 w-8 transition-colors',
                      (hover || rating) >= n
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm font-medium text-muted-foreground">{rating}/5</span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-comment">Comentário (opcional)</Label>
            <Textarea
              id="review-comment"
              placeholder="Conte como foi sua experiência..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              'Enviar Avaliação'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ReviewDialog
