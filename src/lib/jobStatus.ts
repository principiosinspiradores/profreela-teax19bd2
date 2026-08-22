export function jobStatusLabel(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Aceito'
    case 'in_progress':
      return 'Em andamento'
    case 'completed':
      return 'Concluído'
    case 'pending':
      return 'Pendente'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status
  }
}
