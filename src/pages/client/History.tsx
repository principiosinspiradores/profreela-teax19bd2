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

const historyData = [
  {
    id: '1029',
    date: '12/04/2026',
    type: 'Faxina Comercial',
    pro: 'Ana Silva',
    value: 150.0,
    status: 'completed',
    rating: 5,
  },
  {
    id: '1028',
    date: '05/04/2026',
    type: 'Camareira',
    pro: 'Juliana Costa',
    value: 180.0,
    status: 'completed',
    rating: 4,
  },
  {
    id: '1025',
    date: '28/03/2026',
    type: 'Faxina (Emergência)',
    pro: 'Roberto Santos',
    value: 225.0,
    status: 'completed',
    rating: 5,
  },
  {
    id: '1022',
    date: '15/03/2026',
    type: 'Ajudante Geral',
    pro: 'Marcos Lima',
    value: 140.0,
    status: 'cancelled',
    rating: null,
  },
]

export default function ClientHistory() {
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
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyData.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium">#{job.id}</TableCell>
                <TableCell>{job.date}</TableCell>
                <TableCell>{job.type}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {job.pro}
                    {job.rating && (
                      <span className="flex items-center text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {job.rating} <Star className="h-3 w-3 ml-0.5 fill-accent" />
                      </span>
                    )}
                  </div>
                </TableCell>
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
                <TableCell className="text-right">R$ {job.value.toFixed(2)}</TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Baixar Recibo"
                    disabled={job.status !== 'completed'}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
