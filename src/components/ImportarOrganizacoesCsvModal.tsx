import { useState, useMemo, useCallback } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const TIPO_TAREFA = "18a81316-9ca6-4e3f-980c-c771b821a730";

function extrairEstado(endereco: string): string | null {
  if (!endereco) return null;
  // patterns: "- XX, Brasil", "XX, Brasil", ", XX -", ", XX,"
  const patterns = [
    /[-,]\s*([A-Z]{2})\s*,\s*Brasil/i,
    /,\s*([A-Z]{2})\s*-/,
    /,\s*([A-Z]{2})\s*,/,
    /\s([A-Z]{2})\s*,\s*Brasil/i,
  ];
  for (const p of patterns) {
    const m = endereco.match(p);
    if (m && UFS.includes(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

function extrairCidade(endereco: string, uf: string | null): string | null {
  if (!endereco) return null;
  // Tipicamente: "Rua X, 123 - Bairro, Cidade - UF, Brasil"
  if (uf) {
    const re = new RegExp(`([^,\\-]+?)\\s*[-,]\\s*${uf}\\b`, "i");
    const m = endereco.match(re);
    if (m) return m[1].trim().replace(/^.*[-,]\s*/, "").trim();
  }
  return null;
}

interface LinhaCsv {
  nome: string;
  endereco: string;
  etiquetas: string;
  cidade: string | null;
  estado: string | null;
  responsavel_id: string | null;
  selecionada: boolean;
  responsavel_manual?: string;
}

export default function ImportarOrganizacoesCsvModal({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [linhas, setLinhas] = useState<LinhaCsv[]>([]);
  const [erroParse, setErroParse] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultado, setResultado] = useState({ ok: 0, ignoradas: 0, erros: [] as string[], tarefas: 0 });

  const reset = () => {
    setEtapa(1); setLinhas([]); setErroParse(""); setImporting(false);
    setProgress(0); setResultado({ ok: 0, ignoradas: 0, erros: [], tarefas: 0 });
  };

  const handleFile = useCallback((file: File) => {
    setErroParse("");
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const colNome = fields.find((f) => /Organiza(ç|c)ão\s*-\s*Nome/i.test(f));
        if (!colNome) {
          setErroParse("Formato não reconhecido. Use um CSV exportado do Pipedrive.");
          return;
        }
        const colEnd = fields.find((f) => /Endere/i.test(f));
        const colEtiq = fields.find((f) => /Etiqueta/i.test(f));
        const parsed: LinhaCsv[] = results.data
          .map((row) => {
            const nome = (row[colNome] ?? "").trim();
            if (!nome) return null;
            const endereco = (colEnd ? row[colEnd] : "").trim();
            const etiquetas = (colEtiq ? row[colEtiq] : "").trim();
            const estado = extrairEstado(endereco);
            const cidade = extrairCidade(endereco, estado);
            return {
              nome, endereco, etiquetas, cidade, estado,
               responsavel_id: null,
              selecionada: true,
            };
          })
          .filter(Boolean) as LinhaCsv[];
        if (parsed.length === 0) {
          setErroParse("Nenhuma organização encontrada no arquivo.");
          return;
        }
        setLinhas(parsed);
      },
      error: (err) => setErroParse("Erro ao ler CSV: " + err.message),
    });
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const resumo = useMemo(() => {
    const total = linhas.length;
    const comEstado = linhas.filter((l) => l.estado).length;
    const semEstado = total - comEstado;
    const selecionadas = linhas.filter((l) => l.selecionada).length;
    return { total, comEstado, semEstado, selecionadas };
  }, [linhas]);

  const toggleTodas = (v: boolean) => setLinhas((ls) => ls.map((l) => ({ ...l, selecionada: v })));
  const toggleUma = (i: number, v: boolean) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, selecionada: v } : l)));
  const setRespManual = (i: number, id: string) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, responsavel_manual: id } : l)));

  const importar = async () => {
    const sel = linhas.filter((l) => l.selecionada);
    if (sel.length === 0) return;
    setImporting(true);
    setProgress(0);

    const dataAtividade = new Date();
    dataAtividade.setDate(dataAtividade.getDate() + 7);

    let ok = 0, ignoradas = 0, tarefas = 0;
    const erros: string[] = [];

    for (let i = 0; i < sel.length; i++) {
      const l = sel[i];
      try {
        const { data: existing } = await supabase
          .from("organizacoes")
          .select("id")
          .ilike("nome", l.nome)
          .maybeSingle();

        if (existing) {
          ignoradas++;
        } else {
           const responsavel_id = null;
          const tags = l.etiquetas
            ? l.etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
            : [];

          const { data: novaOrg, error: errOrg } = await supabase
            .from("organizacoes")
            .insert({
              nome: l.nome,
              endereco: l.endereco || null,
              cidade: l.cidade,
              estado: l.estado,
              tags,
              responsavel_id,
              status: "ativo",
            })
            .select("id")
            .single();

          if (errOrg) throw errOrg;

           if (novaOrg && responsavel_id) {
            const { error: errAt } = await supabase.from("atividades").insert({
              organizacao_id: novaOrg.id,
              tipo_id: TIPO_TAREFA,
              titulo: "Atualizar contatos desta organização",
              descricao: "Organização importada do Pipedrive. Verificar e atualizar contatos cadastrados.",
              responsavel_id,
              data_atividade: dataAtividade.toISOString(),
              concluida: false,
              evento_automatico: true,
            } as any);
            if (!errAt) tarefas++;
          }
          ok++;
        }
      } catch (e: any) {
        erros.push(`${l.nome}: ${e.message ?? "erro"}`);
      }
      setProgress(Math.round(((i + 1) / sel.length) * 100));
    }

    setResultado({ ok, ignoradas, tarefas, erros });
    setImporting(false);
    setEtapa(3);
    qc.invalidateQueries({ queryKey: ["organizacoes"] });
    toast({ title: "Importação concluída", description: `${ok} criadas, ${ignoradas} ignoradas` });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar CSV do Pipedrive — Etapa {etapa} de 3</DialogTitle>
        </DialogHeader>

        {etapa === 1 && (
          <div className="space-y-4">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/50"
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <div className="font-medium">Clique para selecionar ou arraste o arquivo CSV</div>
                <div className="text-sm text-muted-foreground">Apenas arquivos .csv exportados do Pipedrive</div>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
            {erroParse && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
                <AlertTriangle className="w-4 h-4" /> {erroParse}
              </div>
            )}
            {linhas.length > 0 && (
              <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-800 p-3 rounded">
                <FileText className="w-4 h-4" />
                {linhas.length} organizações encontradas no CSV
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={linhas.length === 0} onClick={() => setEtapa(2)}>Próximo</Button>
            </DialogFooter>
          </div>
        )}

        {etapa === 2 && (
          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Total</div><div className="font-bold">{resumo.total}</div></div>
               <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Com estado</div><div className="font-bold text-emerald-600">{resumo.comEstado}</div></div>
               <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Sem estado</div><div className="font-bold text-amber-600">{resumo.semEstado}</div></div>
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Selecionadas</div><div className="font-bold">{resumo.selecionadas}</div></div>
            </div>

            <div className="overflow-auto border rounded flex-1">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={resumo.selecionadas === resumo.total}
                        onCheckedChange={(v) => toggleTodas(!!v)}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead>Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Checkbox checked={l.selecionada} onCheckedChange={(v) => toggleUma(i, !!v)} />
                      </TableCell>
                      <TableCell className="text-sm">{l.nome}</TableCell>
                      <TableCell className="text-sm">
                        {l.estado ? (
                          <span>{l.cidade ?? "—"} / <b>{l.estado}</b></span>
                        ) : (
                          <Badge variant="destructive">Sem estado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                         <Badge variant="outline">Pendente</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {importing && <Progress value={progress} />}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={importing}>Voltar</Button>
              <Button onClick={importar} disabled={importing || resumo.selecionadas === 0}>
                {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : `Importar ${resumo.selecionadas} organizações`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {etapa === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 p-4 rounded">
              <CheckCircle2 className="w-5 h-5" /> Importação concluída
            </div>
            <ul className="text-sm space-y-1">
              <li><b>{resultado.ok}</b> organizações criadas</li>
               <li><b>{resultado.tarefas}</b> tarefas criadas automaticamente</li>
              <li><b>{resultado.ignoradas}</b> ignoradas (já existiam)</li>
              <li><b>{resultado.erros.length}</b> erros</li>
            </ul>
            {resultado.erros.length > 0 && (
              <div className="max-h-40 overflow-auto border rounded p-2 text-xs space-y-1 bg-destructive/5">
                {resultado.erros.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
