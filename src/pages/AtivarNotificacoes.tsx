import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Loader2, Share, PlusSquare, Smartphone, CheckCircle2, XCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { estadoPlataforma } from "@/lib/push/plataforma";
import { ativarPush, pushAlertPronto, pushDisponivelAqui, registrarAparelho, standalone, subscriberAtual, temPushNoNavegador } from "@/lib/push/pushalert";

type Inscricao = { id: string; user_id: string; plataforma: string; ativo: boolean; ultimo_envio: string | null; criado_em: string };
const dataBR = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function useMinhasInscricoes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["push-inscricoes", user?.id],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const r = await (supabase as any).from("push_inscricoes").select("id,user_id,plataforma,ativo,ultimo_envio,criado_em").eq("user_id", user!.id);
      if (r.error) return null; // tabela ainda não criada
      return r.data as Inscricao[];
    },
  });
}

function PassoIOS({ n, icone, children }: { n: number; icone: React.ReactNode; children: React.ReactNode }) {
  return <li className="flex gap-3 items-start"><span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm">{n}</span><span className="text-sm pt-1 flex items-center gap-2 flex-wrap">{children}{icone}</span></li>;
}

function PainelTime() {
  const { data } = useQuery({
    queryKey: ["push-time"],
    queryFn: async () => {
      const [p, i] = await Promise.all([
        supabase.from("profiles").select("user_id,nome").eq("status", "approved").order("nome"),
        (supabase as any).from("push_inscricoes").select("user_id,plataforma,ativo,ultimo_envio"),
      ]);
      if (i.error) return null;
      return (p.data ?? []).map((u) => {
        const subs = (i.data as Inscricao[]).filter((s) => s.user_id === u.user_id && s.ativo);
        return { ...u, aparelhos: subs.length, plataformas: [...new Set(subs.map((s) => s.plataforma))].join(", "), ultimo: subs.map((s) => s.ultimo_envio).filter(Boolean).sort().at(-1) ?? null };
      });
    },
  });
  if (data === null) return null;
  const sem = data?.filter((u) => !u.aparelhos).length ?? 0;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Time com notificação no celular</h2>{data && <Badge variant="outline">{sem} sem ativar</Badge>}</div>
      {!data ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="divide-y">
          {data.map((u) => (
            <div key={u.user_id} className="py-2 flex items-center gap-2 text-sm">
              {u.aparelhos ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
              <span className="flex-1">{u.nome}</span>
              <span className="text-muted-foreground text-xs">{u.aparelhos ? `${u.aparelhos} aparelho(s) · ${u.plataformas} · último envio ${dataBR(u.ultimo)}` : "sem push"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AtivarNotificacoes() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { data: minhas } = useMinhasInscricoes();
  const [ativando, setAtivando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [aqui, setAqui] = useState<string | null>(null);

  const estado = useMemo(() => estadoPlataforma({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone: standalone(), temPush: temPushNoNavegador() }), []);
  const dominioOk = pushDisponivelAqui();
  const permissao = typeof Notification !== "undefined" ? Notification.permission : "default";
  const servidorPronto = minhas !== null;

  useEffect(() => { if (dominioOk) pushAlertPronto().then(() => setAqui(subscriberAtual())); }, [dominioOk]);

  const ativar = async () => {
    if (!user) return;
    setAtivando(true);
    try {
      const id = await ativarPush();
      await registrarAparelho(id, user.id);
      setAqui(id);
      qc.invalidateQueries({ queryKey: ["push-inscricoes"] });
      toast.success("Notificações ativadas neste aparelho");
    } catch (e) { toast.error((e as Error).message); }
    finally { setAtivando(false); }
  };

  const testar = async () => {
    setTestando(true);
    const { data, error } = await supabase.functions.invoke("push-enviar", { body: { acao: "teste" } });
    setTestando(false);
    if (error) toast.error("Falha ao enviar o teste");
    else if (!data?.aparelhos) toast.warning("Nenhum aparelho ativo para você.");
    else toast.success(`Teste enviado para ${data.enviados} de ${data.aparelhos} aparelho(s).`);
  };

  const ativoAqui = !!aqui && !!minhas?.some((m) => m.ativo);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" /> Início</Button>
          <h1 className="font-semibold text-lg flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /> Notificações no celular</h1>
          <div className="ml-auto"><AppHeader /></div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Card className="p-4 text-sm text-muted-foreground">
          Receba no celular os avisos do sininho que pedem ação: atividade vencida, alguém marcou algo para você, ligação da Júlia que caiu. Entre 21h e 7h os avisos comuns esperam até as 7h.
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <span className="font-medium flex-1">Este aparelho</span>
            {ativoAqui ? <Badge>Ativo</Badge> : permissao === "denied" ? <Badge variant="destructive">Bloqueado</Badge> : <Badge variant="outline">Não ativado</Badge>}
          </div>

          {!dominioOk ? (
            <p className="text-sm">As notificações funcionam apenas pelo endereço <a className="text-primary underline" href="https://crmls.com.br/notificacoes/ativar">crmls.com.br</a>.</p>
          ) : !servidorPronto ? (
            <p className="text-sm text-muted-foreground">As notificações ainda estão sendo preparadas. Volte em breve.</p>
          ) : estado === "ios_antigo" ? (
            <p className="text-sm">Este iPhone precisa do iOS 16.4 ou mais novo. Atualize em Ajustes → Geral → Atualização de Software.</p>
          ) : estado === "ios_fora_app" ? (
            <div className="space-y-3">
              <p className="text-sm">No iPhone, as notificações só funcionam com o CRM na Tela de Início:</p>
              <ol className="space-y-2">
                <PassoIOS n={1} icone={<Share className="h-4 w-4 text-primary" />}>No Safari, toque em Compartilhar</PassoIOS>
                <PassoIOS n={2} icone={<PlusSquare className="h-4 w-4 text-primary" />}>Escolha "Adicionar à Tela de Início"</PassoIOS>
                <PassoIOS n={3} icone={null}>Abra o CRM LS pelo novo ícone</PassoIOS>
                <PassoIOS n={4} icone={null}>Volte nesta tela e toque em "Ativar notificações"</PassoIOS>
              </ol>
            </div>
          ) : estado === "nao_suportado" ? (
            <p className="text-sm">Este navegador não aceita notificações. No Android use o Chrome.</p>
          ) : permissao === "denied" ? (
            <p className="text-sm">As notificações foram bloqueadas. Libere nos ajustes do celular (Notificações → CRM LS, ou no Chrome: cadeado ao lado do endereço → Notificações) e volte aqui.</p>
          ) : ativoAqui ? (
            <p className="text-sm text-muted-foreground">Tudo certo: este aparelho recebe as notificações.</p>
          ) : (
            <Button onClick={ativar} disabled={ativando}>{ativando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Ativar notificações</Button>
          )}

          {servidorPronto && !!minhas?.some((m) => m.ativo) && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-sm text-muted-foreground flex-1">{minhas.filter((m) => m.ativo).length} aparelho(s) ativo(s) na sua conta</span>
              <Button variant="outline" size="sm" onClick={testar} disabled={testando}>{testando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Enviar push de teste para mim</Button>
            </div>
          )}
        </Card>

        {isAdmin && <PainelTime />}
      </main>
    </div>
  );
}
