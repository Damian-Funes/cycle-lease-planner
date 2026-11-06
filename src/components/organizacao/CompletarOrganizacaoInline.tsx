import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { telefoneValido, type OrgIncompletaFlags } from "@/hooks/useOrganizacoesIncompletas";

/** Preenche ali mesmo só o que falta. Nunca sobrescreve: só cria pessoa nova e completa cidade/UF vazias. */
export default function CompletarOrganizacaoInline({ org, flags, onDone, onDescartar }: {
  org: { id: string; nome: string; cidade?: string | null; estado?: string | null };
  flags: OrgIncompletaFlags;
  onDone: () => void;
  onDescartar: () => void;
}) {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [tel, setTel] = useState("");
  const [cidade, setCidade] = useState(org.cidade ?? "");
  const [uf, setUf] = useState(org.estado ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      if (flags.semContato) {
        if (!nome.trim() || !telefoneValido(tel)) throw new Error("Informe nome e telefone com DDD do contato.");
        const { error } = await supabase.from("pessoas").insert({ nome: nome.trim(), cargo: cargo.trim() || null, telefone: tel.trim(), organizacao_id: org.id, responsavel_id: user?.id } as any);
        if (error) throw error;
      }
      if (flags.semCidadeEstado) {
        const sigla = uf.trim().toUpperCase();
        if (!cidade.trim() || !/^[A-Z]{2}$/.test(sigla)) throw new Error("Informe cidade e UF (2 letras).");
        const { data: est } = await (supabase as any).from("estados").select("id").eq("sigla", sigla).maybeSingle();
        if (!est) throw new Error("UF inválida.");
        const { error } = await (supabase as any).from("organizacoes").update({ cidade: cidade.trim(), estado: sigla, estado_id: est.id }).eq("id", org.id);
        if (error) throw error;
      }
      toast.success(`${org.nome} atualizada`);
      onDone();
    } catch (e: any) { toast.error(e?.message || "Não foi possível salvar"); } finally { setSalvando(false); }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2" onClick={(e) => e.stopPropagation()}>
      {flags.semContato && (
        <>
          <Input className="h-8 w-36" placeholder="Nome do contato *" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input className="h-8 w-28" placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <Input className="h-8 w-36" placeholder="Telefone com DDD *" value={tel} onChange={(e) => setTel(e.target.value)} />
        </>
      )}
      {flags.semCidadeEstado && (
        <>
          <Input className="h-8 w-36" placeholder="Cidade *" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          <Input className="h-8 w-14" placeholder="UF" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value)} />
        </>
      )}
      {(flags.semContato || flags.semCidadeEstado) && <Button size="sm" className="h-8" onClick={salvar} disabled={salvando}>Salvar</Button>}
      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={onDescartar}>Descartar</Button>
    </div>
  );
}
