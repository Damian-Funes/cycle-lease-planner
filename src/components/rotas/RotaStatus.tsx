import { Badge } from '@/components/ui/badge';
import { STATUS_ROTAS, type StatusRota } from '@/lib/rotasFluxo';
export default function RotaStatus({ status }: { status: StatusRota }) {
  const variant = status === 'reprovada' ? 'destructive' : status === 'aprovada' || status === 'concluida' ? 'default' : status === 'aguardando_aprovacao' ? 'outline' : 'secondary';
  return <Badge variant={variant}>{STATUS_ROTAS[status] ?? status}</Badge>;
}