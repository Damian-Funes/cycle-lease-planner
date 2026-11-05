import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { erroMeta, textoSaude, traduzStatus, traduzVerificacao, type Resultado } from "@/lib/whatsapp";

type Acao = "status" | "pedir_codigo" | "confirmar_codigo" | "registrar" | "conectar_app";

async function chamar(body: Record<string, unknown>): Promise<{ res: Resultado; data?: any }> {
  const { data, error } = await supabase.functions.invoke("whatsapp-ativar", { body });
  if (error) {
    let corpo: unknown = { error: error.message };
    if (error instanceof FunctionsHttpError) {
      const txt = await error.context.text().catch(() => "");
      try { corpo = JSON.parse(txt); } catch { corpo = txt || corpo; }
    }
    const e = erroMeta(corpo);
    return { res: { ok: false, ...e } };
  }
  if (!data?.ok) return { res: { ok: false, ...erroMeta(data) } };
  return { res: { ok: true, texto: "Feito com sucesso." }, data: data.body };
}

function Mensagem({ r }: { r?: Resultado }) {
  if (!r) return null;
  return r.ok ? (
    <p className="text-sm text-primary mt-2">{r.texto}</p>
  ) : (
    <p className="text-sm text-destructive mt-2 whitespace-pre-line">{r.texto}{r.codigo ? ` (código ${r.codigo})` : ""}</p>
  );
}

const so6 = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export default function ConfiguracoesWhatsapp() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState<Acao | null>(null);
  const [res, setRes] = useState<Partial<Record<Acao, Resultado>>>({});
  const [info, setInfo] = useState<any>(null);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");

  const executar = async (acao: Acao, extra: Record<string, unknown> = {}) => {
    setCarregando(acao);
    try {
      const { res: r, data } = await chamar({ acao, ...extra });
      setRes((p) => ({ ...p, [acao]: r }));
      if (acao === "status" && r.ok) setInfo(data);
      if (acao === "registrar") setPin("");
    } finally {
      setCarregando(null);
    }
  };

  const Botao = ({ acao, children, disabled, extra }: { acao: Acao; children: React.ReactNode; disabled?: boolean; extra?: Record<string, unknown> }) => (
    <Button onClick={() => executar(acao, extra)} disabled={disabled || carregando !== null}>
      {carregando === acao && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </Button>
  );

  const saude = textoSaude(info?.health_status);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Voltar</Button>
          <AppHeader />
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-2xl font-semibold">WhatsApp da LS</h1>

        <Card className="p-4">
          <h2 className="font-semibold">1. Status do número</h2>
          <div className="mt-3"><Botao acao="status">Atualizar status</Botao></div>
          {info && (
            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Número</dt><dd>{info.display_phone_number ?? "—"}</dd>
              <dt className="text-muted-foreground">Nome</dt><dd>{info.verified_name ?? "—"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{traduzStatus(info.status)}</dd>
              <dt className="text-muted-foreground">Verificação</dt><dd>{traduzVerificacao(info.code_verification_status)}</dd>
              {saude && (<><dt className="text-muted-foreground">Saúde</dt><dd className="whitespace-pre-line">{saude}</dd></>)}
            </dl>
          )}
          <Mensagem r={res.status && !res.status.ok ? res.status : undefined} />
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">2. Pedir código por ligação</h2>
          <p className="text-sm text-muted-foreground mt-1">A Meta vai ligar para (44) 3040-6098 e falar um código de 6 dígitos. Tenha o telefone por perto.</p>
          <div className="mt-3"><Botao acao="pedir_codigo">Pedir código</Botao></div>
          <Mensagem r={res.pedir_codigo} />
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">3. Confirmar código</h2>
          <div className="mt-3 flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="wa-codigo">Código de 6 dígitos</Label>
              <Input id="wa-codigo" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(so6(e.target.value))} className="w-40" />
            </div>
            <Botao acao="confirmar_codigo" disabled={codigo.length !== 6} extra={{ code: codigo }}>Confirmar código</Botao>
          </div>
          <Mensagem r={res.confirmar_codigo} />
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">4. Ativar número</h2>
          <p className="text-sm text-muted-foreground mt-1">Guarde este PIN; a Meta pede para reativar o número.</p>
          <div className="mt-3 flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="wa-pin">PIN de 6 dígitos</Label>
              <Input id="wa-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(so6(e.target.value))} className="w-40" />
            </div>
            <Botao acao="registrar" disabled={pin.length !== 6} extra={{ pin }}>Ativar número</Botao>
          </div>
          <Mensagem r={res.registrar} />
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">5. Conectar ao CRM</h2>
          <div className="mt-3"><Botao acao="conectar_app">Conectar ao CRM</Botao></div>
          <Mensagem r={res.conectar_app} />
        </Card>
      </main>
    </div>
  );
}
