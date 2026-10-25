import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function NumeroInput({label,value,onChange,nullable=false,integer=false}: {label:string;value:number|null;onChange:(n:number|null)=>void;nullable?:boolean;integer?:boolean}) {
  const id=useId();
  const [draft,setDraft]=useState<string|null>(null);
  const formatted=value===null?'':value.toLocaleString('pt-BR',{maximumFractionDigits:6});
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} inputMode={integer?'numeric':'decimal'} value={draft??formatted} onFocus={()=>setDraft(formatted)} onBlur={()=>setDraft(null)} onChange={e=>{
    const raw=e.target.value.replace(/[^\d,]/g,'');
    const [inteiro,...fracao]=raw.split(',');
    const texto=(inteiro?Number(inteiro).toLocaleString('pt-BR'):'')+(!integer&&fracao.length?','+fracao.join('').slice(0,6):'');
    setDraft(texto);
    const n=Number((inteiro||'0')+(!integer&&fracao.length?'.'+fracao.join(''):''));
    onChange(!raw?nullable?null:0:n);
  }}/></div>;
}