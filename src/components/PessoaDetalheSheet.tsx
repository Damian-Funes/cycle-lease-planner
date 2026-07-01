import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, Linkedin, Building2, Star, Pencil, User } from "lucide-react";
import { Link } from "react-router-dom";
import { InformacoesImportantes, PerfilComportamental } from "./IaInsights";
import type { PessoaRow } from "./PessoaFormModal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoaId?: string | null;
  onEdit?: (p: PessoaRow) => void;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function PessoaDetalheSheet({ open, onOpenChange, pessoaId, onEdit }: Props) {
  const { data: pessoa } = useQuery({
    queryKey: ["pessoa-detalhe", pessoaId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pessoas").select("*").eq("id", pessoaId).maybeSingle();
      return (data ?? null) as PessoaRow | null;
    },
    enabled: !!pessoaId && open,
  });

  const { data: org } = useQuery({
    queryKey: ["pessoa-org", pessoa?.organizacao_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("organizacoes").select("id, nome").eq("id", pessoa?.organizacao_id).maybeSingle();
      return data as { id: string; nome: string } | null;
    },
    enabled: !!pessoa?.organizacao_id,
  });

  const { data: resp } = useQuery({
    queryKey: ["pessoa-resp", pessoa?.responsavel_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("nome, email").eq("user_id", pessoa?.responsavel_id!).maybeSingle();
      return data as { nome: string | null; email: string } | null;
    },
    enabled: !!pessoa?.responsavel_id,
  });

  const tel = pessoa?.celular || pessoa?.telefone;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback>{pessoa ? initials(pessoa.nome) : <User className="w-4 h-4" />}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate">{pessoa?.nome ?? "…"}</span>
                {pessoa?.e_decisor && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
              </div>
              {pessoa?.cargo && (
                <div className="text-xs font-normal text-muted-foreground">{pessoa.cargo}</div>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        {!pessoa ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="mt-4 space-y-4">
            {org && (
              <Link
                to={`/organizacoes/${org.id}`}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <Building2 className="w-4 h-4" /> {org.nome}
              </Link>
            )}

            <div className="rounded-xl border border-border p-4 space-y-2">
              <Info label="E-mail" value={pessoa.email} href={pessoa.email ? `mailto:${pessoa.email}` : undefined} icon={<Mail className="w-3.5 h-3.5" />} />
              <Info label="Telefone" value={pessoa.telefone} href={pessoa.telefone ? `tel:${pessoa.telefone}` : undefined} icon={<Phone className="w-3.5 h-3.5" />} />
              <Info label="Celular" value={pessoa.celular} href={pessoa.celular ? `tel:${pessoa.celular}` : undefined} icon={<Phone className="w-3.5 h-3.5" />} />
              <Info label="LinkedIn" value={pessoa.linkedin} href={pessoa.linkedin || undefined} icon={<Linkedin className="w-3.5 h-3.5" />} />
              {resp && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Responsável</span>
                  <span>{resp.nome || resp.email}</span>
                </div>
              )}
              {pessoa.e_decisor && (
                <Badge variant="secondary" className="gap-1">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Decisor
                </Badge>
              )}
            </div>

            <PerfilComportamental pessoaId={pessoa.id} />
            <InformacoesImportantes texto={pessoa.informacoes_importantes} />

            {pessoa.observacoes && (
              <div className="rounded-xl border border-border p-4">
                <div className="mb-2 text-sm font-medium">Observações</div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{pessoa.observacoes}</p>
              </div>
            )}

            <Separator />
            <div className="flex justify-end gap-2">
              {pessoa.email && (
                <a href={`mailto:${pessoa.email}`}><Button variant="outline" size="sm" className="gap-1"><Mail className="w-4 h-4" /> E-mail</Button></a>
              )}
              {tel && (
                <a href={`tel:${tel}`}><Button variant="outline" size="sm" className="gap-1"><Phone className="w-4 h-4" /> Ligar</Button></a>
              )}
              {onEdit && (
                <Button size="sm" className="gap-1" onClick={() => { onEdit(pessoa); onOpenChange(false); }}>
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value, href, icon }: { label: string; value?: string | null; href?: string; icon?: React.ReactNode }) {
  if (!value) return null;
  const content = (
    <span className="inline-flex items-center gap-1.5">{icon}{value}</span>
  );
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {href ? <a href={href} className="text-primary hover:underline truncate max-w-[60%] text-right">{content}</a>
            : <span className="truncate max-w-[60%] text-right">{content}</span>}
    </div>
  );
}
