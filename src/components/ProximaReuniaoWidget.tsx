import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Video, Calendar, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface ProximaReuniao {
  id: string;
  titulo: string;
  data_inicio: string;
  google_meet_link: string;
  organizacao_id: string | null;
  oportunidade_id: string | null;
}

export default function ProximaReuniaoWidget() {
  const [reuniao, setReuniao] = useState<ProximaReuniao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await (supabase as any)
        .from("atividades")
        .select("id, titulo, data_inicio, google_meet_link, organizacao_id, oportunidade_id")
        .eq("responsavel_id", user.id)
        .eq("concluida", false)
        .not("google_meet_link", "is", null)
        .gte("data_inicio", new Date().toISOString())
        .order("data_inicio", { ascending: true })
        .limit(1);
      setReuniao(((data as any) || [])[0] || null);
      setLoading(false);
    })();
  }, []);

  if (loading || !reuniao) return null;

  const d = new Date(reuniao.data_inicio);

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Video className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase text-primary tracking-wide">Próxima reunião</div>
          <div className="font-semibold truncate">{reuniao.titulo}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Calendar className="h-3.5 w-3.5" />
            {format(d, "PPP 'às' HH:mm", { locale: ptBR })}
            <span className="text-xs">· {formatDistanceToNow(d, { locale: ptBR, addSuffix: true })}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <a
              href={reuniao.google_meet_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <Video className="h-4 w-4" /> Entrar no Meet <ExternalLink className="h-3 w-3" />
            </a>
            {reuniao.oportunidade_id && (
              <Link to={`/crm/deal/${reuniao.oportunidade_id}`} className="text-sm text-muted-foreground hover:underline">
                Ver oportunidade
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
