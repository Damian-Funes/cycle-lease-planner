import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { chamarJulia, useLigacoesViagem } from '@/hooks/useLigacoesViagem';
import { hojeRota } from '@/lib/rotasFluxo';
export default function JuliaContatoCard({rotaId}:{rotaId:string}) {
 const {data:ligacoes=[]}=useLigacoesViagem(rotaId,hojeRota()); const qc=useQueryClient(); const [busy,setBusy]=useState(false);
 const l=ligacoes.find(l=>!l.teste && ['aguardando_escolha','agendada','cancelada'].includes(l.status));
 if(!l) return null;
 return <Card className="p-4 space-y-3 border-primary/50"><p className="font-semibold flex gap-2 items-center"><Phone className="w-4 h-4"/>Quando a Júlia pode te ligar?</p>
 {l.escolha && <p className="text-sm text-muted-foreground">{l.escolha==='app'?'Você escolheu preencher no app.':`Ligação agendada: ${new Date(l.agendada_para).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}`}</p>}
 {l.status!=='cancelada' && <div className="flex flex-wrap gap-2">{[['agora','Agora'],['18h','18h'],['19h','19h'],['20h','20h'],['app','Vou preencher no app']].map(([escolha,label])=><Button key={escolha} variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await chamarJulia({modo:'escolha',ligacao_id:l.id,escolha});await qc.invalidateQueries({queryKey:['ligacoes-viagem']});toast.success('Escolha registrada');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}>{label}</Button>)}</div>}
 </Card>;
}