import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, Lock, ExternalLink } from "lucide-react";
import OrganizacaoFormModal from "./OrganizacaoFormModal";
import PessoaFormModal from "./PessoaFormModal";
import { toast } from "sonner";

export interface SeletorOrgValue {
  organizacao_id?: string | null;
  pessoa_contato_id?: string | null;
}

interface Props {
  value: SeletorOrgValue;
  onChange: (v: SeletorOrgValue) => void;
  pedirContato?: boolean;
  disabled?: boolean;
  showDataPreview?: boolean;
  /** Callback chamado quando admin clica em "Descongelar dados" */
  onDescongelar?: () => void | Promise<void>;
}

export default function SeletorOrganizacao({
  value,
  onChange,
  pedirContato = true,
  disabled = false,
  showDataPreview = true,
  onDescongelar,
}: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [openOrg, setOpenOrg] = useState(false);
  const [openPes, setOpenPes] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showPesModal, setShowPesModal] = useState(false);

  const { data: organizacoes = [] } = useQuery({
    queryKey: ["organizacoes-seletor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizacoes")
        .select("id, nome, nome_fantasia, cnpj, endereco, telefone_principal, email_principal")
        .order("nome", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ["pessoas-seletor", value.organizacao_id],
    queryFn: async () => {
      if (!value.organizacao_id) return [];
      const { data, error } = await supabase
        .from("pessoas")
        .select("id, nome, cargo, email")
        .eq("organizacao_id", value.organizacao_id)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!value.organizacao_id,
  });

  const orgSelecionada = useMemo(
    () => organizacoes.find((o) => o.id === value.organizacao_id),
    [organizacoes, value.organizacao_id]
  );
  const pesSelecionada = useMemo(
    () => pessoas.find((p) => p.id === value.pessoa_contato_id),
    [pessoas, value.pessoa_contato_id]
  );

  function selectOrg(id: string) {
    onChange({ organizacao_id: id, pessoa_contato_id: null });
    setOpenOrg(false);
  }
  function selectPessoa(id: string) {
    onChange({ ...value, pessoa_contato_id: id });
    setOpenPes(false);
  }

  return (
    <div className="space-y-3">
      {/* Linha 1: Organização */}
      <div className="space-y-1.5">
        <Label>Organização {disabled && <Lock className="inline w-3 h-3 ml-1" />}</Label>
        <Popover open={openOrg && !disabled} onOpenChange={setOpenOrg}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              <span className="truncate text-left">
                {orgSelecionada ? (
                  <>
                    {orgSelecionada.nome}
                    {orgSelecionada.nome_fantasia && (
                      <span className="text-muted-foreground"> · {orgSelecionada.nome_fantasia}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Selecione uma organização…</span>
                )}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command
              filter={(val, search) => {
                const o = organizacoes.find((x) => x.id === val);
                if (!o) return 0;
                const hay = `${o.nome} ${o.nome_fantasia ?? ""} ${o.cnpj ?? ""}`.toLowerCase();
                return hay.includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Buscar por nome ou CNPJ…" />
              <CommandList>
                <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
                <CommandGroup>
                  {organizacoes.map((o) => (
                    <CommandItem key={o.id} value={o.id} onSelect={() => selectOrg(o.id)}>
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.organizacao_id === o.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">
                          {o.nome}
                          {o.nome_fantasia && (
                            <span className="text-muted-foreground"> · {o.nome_fantasia}</span>
                          )}
                        </span>
                        {o.cnpj && (
                          <span className="text-xs text-muted-foreground">CNPJ: {o.cnpj}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              <div className="border-t p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setOpenOrg(false);
                    setShowOrgModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Criar nova organização
                </Button>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Linha 2: Pessoa de contato */}
      {pedirContato && (
        <div className="space-y-1.5">
          <Label>Pessoa de contato</Label>
          <Popover open={openPes && !disabled} onOpenChange={setOpenPes}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                disabled={disabled || !value.organizacao_id}
                className="w-full justify-between font-normal"
              >
                <span className="truncate text-left">
                  {pesSelecionada ? (
                    <>
                      {pesSelecionada.nome}
                      {pesSelecionada.cargo && (
                        <span className="text-muted-foreground"> · {pesSelecionada.cargo}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {value.organizacao_id ? "Selecione um contato…" : "Selecione a organização primeiro"}
                    </span>
                  )}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar contato…" />
                <CommandList>
                  <CommandEmpty>Nenhum contato cadastrado.</CommandEmpty>
                  <CommandGroup>
                    {pessoas.map((p) => (
                      <CommandItem key={p.id} value={p.nome} onSelect={() => selectPessoa(p.id)}>
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value.pessoa_contato_id === p.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{p.nome}</span>
                          {(p.cargo || p.email) && (
                            <span className="text-xs text-muted-foreground truncate">
                              {[p.cargo, p.email].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
                <div className="border-t p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={!value.organizacao_id}
                    onClick={() => {
                      setOpenPes(false);
                      setShowPesModal(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Criar nova pessoa
                  </Button>
                </div>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Linha 3: Preview */}
      {showDataPreview && orgSelecionada && (
        <div
          className={cn(
            "rounded-md border p-3 text-sm space-y-2",
            disabled ? "bg-amber-50 border-amber-200" : "bg-muted/40"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 flex-1 min-w-0">
              <PreviewField label="CNPJ" value={orgSelecionada.cnpj} />
              <PreviewField label="Telefone" value={orgSelecionada.telefone_principal} />
              <PreviewField label="E-mail" value={orgSelecionada.email_principal} />
              <PreviewField label="Endereço" value={orgSelecionada.endereco} />
            </div>
            {disabled && (
              <Badge variant="outline" className="bg-amber-100 border-amber-300 text-amber-900 shrink-0">
                <Lock className="w-3 h-3 mr-1" /> Dados congelados
              </Badge>
            )}
          </div>

          {disabled ? (
            <div className="flex items-center justify-between pt-1 border-t border-amber-200">
              <p className="text-xs text-amber-900">
                Snapshot do momento da aprovação. Edições no cadastro não afetam este registro.
              </p>
              {isAdmin && onDescongelar && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await onDescongelar();
                      toast.success("Dados descongelados");
                      qc.invalidateQueries();
                    } catch (e: any) {
                      toast.error(e.message || "Erro ao descongelar");
                    }
                  }}
                >
                  Descongelar dados
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1 border-t">
              <p className="text-xs text-muted-foreground">
                Sincronizado com o cadastro da organização. Para editar, abra o perfil.
              </p>
              <Button asChild size="sm" variant="ghost" className="h-7">
                <Link to={`/organizacoes/${orgSelecionada.id}`}>
                  Abrir perfil <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      <OrganizacaoFormModal
        open={showOrgModal}
        onOpenChange={(o) => {
          setShowOrgModal(o);
          if (!o) qc.invalidateQueries({ queryKey: ["organizacoes-seletor"] });
        }}
      />
      <PessoaFormModal
        open={showPesModal}
        onOpenChange={(o) => {
          setShowPesModal(o);
          if (!o) qc.invalidateQueries({ queryKey: ["pessoas-seletor", value.organizacao_id] });
        }}
        defaultOrganizacaoId={value.organizacao_id ?? undefined}
      />
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}
