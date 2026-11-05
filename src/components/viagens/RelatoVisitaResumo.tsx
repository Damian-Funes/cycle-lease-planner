import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { diaRota } from '@/lib/rotasFluxo';
import type { RelatoVisita } from '../../../supabase/functions/_shared/relatoVisita';
export default function RelatoVisitaResumo({ relato }: { relato?: RelatoVisita | null }) {
 if (!relato) return null;
 const campos = [
  ['Contato', [relato.contato_nome, relato.contato_cargo].filter(Boolean).join(' · ')],
  ['Decisores', relato.decisores],
  ['Sacos/safra', relato.sacos_safra?.toLocaleString('pt-BR')],
  ['Equipamento atual', relato.equipamento_atual],
  ['Problema e implicação', relato.problema_principal],
  ['Motivo do interesse', relato.motivo_interesse],
  ['Concorrente', relato.concorrente],
 ];
 return <div className="mt-2 space-y-1 text-sm break-words">
  {relato.interesse && <Badge variant={relato.interesse === 'alto' ? 'default' : relato.interesse === 'baixo' ? 'outline' : 'secondary'}>Interesse {relato.interesse === 'medio' ? 'médio' : relato.interesse}</Badge>}
  {campos.filter(([, valor]) => valor !== undefined && valor !== '').map(([rotulo, valor]) => <p key={rotulo}><span className="text-muted-foreground">{rotulo}: </span>{valor}</p>)}
  {!!relato.objecoes?.length && <div><span className="text-muted-foreground">Objeções:</span><ul className="list-disc pl-5">{relato.objecoes.map((o,i) => <li key={i}>{o}</li>)}</ul></div>}
  {relato.proximo_passo && <p><span className="font-medium">Próximo passo: </span>{relato.proximo_passo}{relato.proximo_passo_data ? ` · até ${diaRota(relato.proximo_passo_data)}` : ''}</p>}
  {relato.atividade_id && <Button asChild variant="link" size="sm" className="px-0"><Link to={`/atividades?atividade=${relato.atividade_id}`}>Ver atividade na agenda</Link></Button>}
 </div>;
}