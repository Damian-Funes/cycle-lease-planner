import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { salvarGasto, type Gasto, type Pernoite } from '@/lib/viagemDados';
import { Receipt } from 'lucide-react';
export default function NotasHotelPendentes({rotaId,pernoites,gastos,editavel}:{rotaId:string;pernoites:Pernoite[];gastos:Gasto[];editavel:boolean}) {
 const qc=useQueryClient();const [sel,setSel]=useState<Gasto|null>(null);const [busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null);
 const pendentes=pernoites.filter(p=>p.tipo==='hotel' && gastos.some(g=>g.id===p.gasto_id&&!g.arquivo_path));
 if(!pendentes.length)return null;
 return <section className="p-3 border border-warning/50 bg-warning/10 rounded-md space-y-2" aria-label="Notas de hotel pendentes"><h2 className="font-semibold">Nota pendente</h2>{pendentes.map(p=><div key={p.id} id={`nota-${p.gasto_id}`} className="flex flex-wrap gap-2 items-center text-sm"><span>{p.hotel_nome} · noite {p.noite.split('-').reverse().join('/')}</span>{editavel&&<Button disabled={busy} variant="outline" size="sm" onClick={()=>{setSel(gastos.find(g=>g.id===p.gasto_id)??null);input.current?.click();}}><Receipt className="w-4 h-4 mr-1"/>Enviar foto</Button>}</div>)}<input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" aria-label="Nota de hotel" onChange={async e=>{const file=e.target.files?.[0];if(!file||!sel)return;setBusy(true);try{await salvarGasto({id:sel.id,rotaId,categoria:sel.categoria,valor:sel.valor,data:sel.data,descricao:sel.descricao,arquivo:file});await qc.invalidateQueries({queryKey:['rota-gastos',rotaId]});toast.success('Nota enviada');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);if(input.current)input.current.value='';}}}/></section>;
}