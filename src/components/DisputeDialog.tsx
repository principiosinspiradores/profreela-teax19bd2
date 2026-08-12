import { useState } from 'react'
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
import { Loader2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { disputePayment } from '@/services/checkout'

/**
 * "Reportar Problema" dialog — opens a dispute on a job's escrow payment,
 * pausing the 7-day guarantee window.
 */
export function DisputeDialog({
  jobId,
  open,
  onOpenChange,
  onDisputed,
}: {
  jobId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDisputed?: () => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!jobId) return
    setSubmitting(true)
    try {
      const res = await disputePayment(jobId, reason || 'Problema reportado pelo cliente')
      if (res?.ok) {
        toast({
          title: 'Disputa aberta',
          description: 'A liberação do pagamento foi pausada. Nossa equipe irá analisar.',
        })
        onOpenChange(false)
        setReason('')
        onDisputed?.()
      } else {
        toast({
          title: 'Não foi possível abrir disputa',
          description: res?.error || 'Tente novamente.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha inesperada.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Reportar Problema
          </DialogTitle>
          <DialogDescription>
            Abra uma disputa para pausar a liberação do pagamento durante o período de garantia.
            Nossa equipe irá analisar o caso.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label htmlFor="dispute-reason">Descreva o problema</Label>
          <Textarea
            id="dispute-reason"
            placeholder="Ex.: serviço não foi concluído conforme combinado..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              'Abrir Disputa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DisputeDialog
