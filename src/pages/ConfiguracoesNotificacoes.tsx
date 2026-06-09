import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Bell, Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";

type Prefs = {
  resumo_semanal: boolean;
  orgs_incompletas: boolean;
  deals_parados: boolean;
  atividades_vencidas: boolean;
  oportunidade_ganha: boolean;
  cliente_sem_visita: boolean;
  rota_amanha: boolean;
  resumo_diario: boolean;
};

const DEFAULT: Prefs = {
  resumo_semanal: true,
  orgs_incompletas: true,
  deals_parados: true,
  atividades_vencidas: true,
  oportunidade_ganha: true,
  cliente_sem_visita: true,
  rota_amanha: true,
  resumo_diario: true,
};

const ITENS: { key: keyof Prefs; titulo: string; desc: string }[] = [
  { key: "resumo_semanal", titulo: "Resumo semanal", desc: "Toda segunda às 8h — lista de organizações com dados faltando." },
  { key: "orgs_incompletas", titulo: "Nova organização incompleta", desc: "Quando uma organização incompleta for atribuída a você." },
  { key: "deals_parados", titulo: "Deal parado", desc: "Alerta quando uma oportunidade fica 15/20/25/30/40/50 dias sem movimento." },
  { key: "atividades_vencidas", titulo: "Atividades vencidas/para hoje", desc: "Todo dia às 7h." },
  { key: "oportunidade_ganha", titulo: "Oportunidade ganha", desc: "Notificação imediata ao fechar negócio." },
  { key: "cliente_sem_visita", titulo: "Cliente sem visita 90+ dias", desc: "Toda segunda às 8h." },
  { key: "rota_amanha", titulo: "Rota de amanhã", desc: "Todo dia às 18h com as paradas planejadas." },
  { key: "resumo_diario", titulo: "Resumo diário", desc: "Todo dia às 7h com atividades, oportunidades e rota do dia." },
];

export default function ConfiguracoesNotificacoes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("email_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const p = { ...DEFAULT };
        (Object.keys(DEFAULT) as (keyof Prefs)[]).forEach((k) => {
          if (typeof (data as any)[k] === "boolean") p[k] = (data as any)[k];
        });
        setPrefs(p);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggle = (k: keyof Prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  const salvar = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_notification_preferences")
      .upsert({ user_id: user.id, ...prefs }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Falha ao salvar", { description: error.message });
    else toast.success("Preferências salvas");
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Início
          </Button>
          <h1 className="font-semibold text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-600" /> Notificações por email
          </h1>
          <div className="ml-auto"><AppHeader /></div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">
                Escolha quais alertas você quer receber por email. Por padrão, todos vêm habilitados.
              </p>
            </Card>
            {ITENS.map((it) => (
              <Card key={it.key} className="p-4 flex items-start gap-4">
                <div className="flex-1">
                  <div className="font-medium">{it.titulo}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{it.desc}</div>
                </div>
                <Switch checked={prefs[it.key]} onCheckedChange={() => toggle(it.key)} />
              </Card>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={salvar} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar preferências
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
