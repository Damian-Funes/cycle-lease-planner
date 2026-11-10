import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useJuliaDisponivel } from '@/hooks/useLigacoesViagem';
import { supabase } from '@/integrations/supabase/client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { sincronizarPendencias } from '@/lib/sincronizarPendencias';
export default function NotificacoesSino({ compacto = false }: { compacto?: boolean } = {}) {
 const {user}=useAuth(); const {data:disponivel}=useJuliaDisponivel(); const qc=useQueryClient();const nav=useNavigate();
 const {data=[]}=useQuery({queryKey:['notificacoes',user?.id],enabled:!!user&&!!disponivel,refetchInterval:60000,queryFn:async()=>{const r=await (supabase as any).from('notificacoes').select('*').eq('user_id',user?.id).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;return r.data as {id:string;titulo:string;texto:string|null;link:string|null;lida_em:string|null;resolvida_em?:string|null}[];}});
 if(!disponivel) return null;
 const n=data.filter(n=>!n.lida_em&&!n.resolvida_em).length;
 return <Popover onOpenChange={o=>{if(o)sincronizarPendencias(undefined,{limitar:true}).then(()=>qc.invalidateQueries({queryKey:['notificacoes']}));}}><PopoverTrigger asChild>{compacto
  ? <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`Notificações (${n})`}><Bell className="w-5 h-5"/>{n>0&&<span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"/>}</Button>
  : <Button variant="ghost" size="sm" aria-label={`Notificações (${n})`}><Bell className="w-4 h-4"/>{n>0&&<span className="ml-1 text-primary">{n}</span>}</Button>}</PopoverTrigger><PopoverContent align="end" className="w-80 max-h-96 overflow-auto"><h2 className="font-semibold mb-2">Notificações</h2>{!data.length&&<p className="text-sm text-muted-foreground">Nenhuma notificação.</p>}{data.map(n=><Button key={n.id} variant="ghost" className="w-full h-auto text-left items-start flex-col whitespace-normal py-3" onClick={async()=>{const r=await(supabase as any).from('notificacoes').update({lida_em:new Date().toISOString()}).eq('id',n.id);if(r.error){toast.error(r.error.message);return;}qc.invalidateQueries({queryKey:['notificacoes']});if(n.link?.startsWith('/'))nav(n.link);}}><span className={n.lida_em||n.resolvida_em?'text-muted-foreground':'font-semibold'}>{n.titulo}{n.resolvida_em&&<span className="ml-2 text-xs font-normal">Resolvida</span>}</span><span className="text-xs text-muted-foreground">{n.texto}</span></Button>)}</PopoverContent></Popover>;
}