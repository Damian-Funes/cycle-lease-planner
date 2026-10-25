import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function NumeroInput({label,value,onChange,nullable=false,integer=false}: {label:string;value:number|null;onChange:(n:number|null)=>void;nullable?:boolean;integer?:boolean}) {
  const id=useId();
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} inputMode={integer?'numeric':'decimal'} value={value===null?'':value.toLocaleString('pt-BR',{maximumFractionDigits:6})} onChange={e=>{
    const s=e.target.value.replace(/\./g,'').replace(',','.').replace(/[^\d.]/g,'');
    onChange(!s ? nullable?null:0 : integer?Math.trunc(Number(s)):Number(s));
  }}/></div>;
}