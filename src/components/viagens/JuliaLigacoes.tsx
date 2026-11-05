import { useLigacoesViagem, chamarJulia } from '@/hooks/useLigacoesViagem';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
export default function JuliaLigacoes({rotaId,admin=false,compacto=false}:{rotaId:string;admin?:boolean;compacto?:boolean}) {
 const {data=[],refetch}=useLigacoesViagem(rotaId); const [busy,setBusy]=useState(false);
 return <section className="space-y-2" onClick={e=>e.stopPropagation()}>
 <p className="font-medium text-sm">Ligações da Júlia</p>
 {admin && <Button size="sm" variant="outline" disabled={busy} onClick={async()=>{if(!confirm('Ligar agora para o vendedor desta viagem?'))return;setBusy(true);try{await chamarJulia({modo:'manual',rota_id:rotaId});await refetch();toast.success('Ligação iniciada');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Phone className="w-4 h-4 mr-1"/>Ligar agora</Button>}
 {(compacto?data.slice(0,1):data).map(l=><div key={l.id} className="text-sm"><p>{l.data_ref.split('-').reverse().join('/')} · tentativa {l.tentativa}/3 · {({agendada:'Agendada',aguardando_escolha:'Aguardando escolha',discando:'Discando',em_andamento:'Em andamento',concluida:'Concluída',nao_atendeu:'Não atendeu',falhou:'Falhou',cancelada:'Cancelada'} as Record<string,string>)[l.status] ?? l.status}{l.teste?' · teste':''}</p>{!compacto && <><p>{l.resumo}</p>{l.transcricao?.length ? <details><summary>Transcrição</summary>{l.transcricao.map((t,i)=><p key={i}><b>{t.role==='user'?'Vendedor':'Júlia'}:</b> {t.message}</p>)}</details>:null}</>}</div>)}
 </section>;
}