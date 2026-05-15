import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Calendar, CheckCircle2, Loader2, LogOut, Video, XCircle } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ConfiguracoesIntegracoes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { integration, loading, connect, disconnect, isConnected } = useGoogleIntegration();

  useEffect(() => {
    const status = params.get("google");
    if (status === "connected") {
      toast.success("Google conectado com sucesso!");
      params.delete("google");
      setParams(params, { replace: true });
    } else if (status === "error") {
      const message = params.get("message") || "Erro desconhecido";
      toast.error("Falha ao conectar Google", { description: message });
      params.delete("google");
      params.delete("message");
      setParams(params, { replace: true });
    }
  }, [params]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />Início
          </Button>
          <h1 className="font-semibold text-lg">Integrações</h1>
          <div className="ml-auto"><AppHeader /></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Google Calendar + Meet</h2>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    <XCircle className="h-3 w-3" /> Não conectado
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte sua conta Google para criar eventos no Calendar e gerar links de reunião do Google Meet automaticamente
                ao registrar atividades do tipo reunião.
              </p>

              {loading ? (
                <div className="mt-4 flex items-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando…
                </div>
              ) : isConnected ? (
                <div className="mt-4 space-y-3">
                  <div className="text-sm">
                    <div><span className="text-muted-foreground">Conta Google:</span> <strong>{integration?.google_email || "—"}</strong></div>
                    <div className="text-xs text-muted-foreground">
                      Conectada em {integration && format(new Date(integration.created_at), "PPP", { locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={connect}>
                      Reconectar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={disconnect}>
                      <LogOut className="h-4 w-4 mr-1" /> Desconectar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <Button onClick={connect} className="gap-2">
                    <Video className="h-4 w-4" /> Conectar Google
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t text-xs text-muted-foreground space-y-1">
            <p>• Os eventos são criados no <strong>seu</strong> calendário Google (calendário primário).</p>
            <p>• Marque "Criar reunião Google Meet" ao criar uma atividade para gerar um link automaticamente.</p>
            <p>• Você pode desconectar a qualquer momento — atividades já sincronizadas mantêm seus links.</p>
          </div>
        </Card>
      </main>
    </div>
  );
}
