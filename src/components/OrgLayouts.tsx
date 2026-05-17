import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, LayoutGrid, ExternalLink } from "lucide-react";
import PlantaImage from "@/components/PlantaImage";

export default function OrgLayouts({ organizacaoId, organizacaoNome }: { organizacaoId: string; organizacaoNome: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["org-layouts", organizacaoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("layouts")
        .select("id, revisao, status, created_at, updated_at, observacoes, piso_imagem_url, unidade")
        .eq("organizacao_id", organizacaoId)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <LayoutGrid className="w-4 h-4" /> Layouts ({data.length})
        </h3>
        <Button size="sm" onClick={() => navigate(`/layouts?organizacao=${organizacaoId}`)}>Ver todos</Button>
      </div>
      {isLoading ? (
        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum layout vinculado</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((l: any) => (
            <Card key={l.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {l.piso_imagem_url
                  ? <PlantaImage source={l.piso_imagem_url} alt="" className="w-full h-full object-cover" fallback={<LayoutGrid className="w-8 h-8 text-muted-foreground/40" />} />
                  : <LayoutGrid className="w-8 h-8 text-muted-foreground/40" />}
              </div>
              <div className="p-3 space-y-1">
                <div className="font-medium text-sm truncate">{l.unidade || organizacaoNome} • {l.revisao}</div>
                <div className="text-xs text-muted-foreground">{new Date(l.updated_at).toLocaleDateString("pt-BR")}</div>
                <Button size="sm" variant="outline" className="w-full mt-2 gap-1" onClick={() => navigate(`/layout/${l.id}`)}>
                  <ExternalLink className="w-3 h-3" /> Abrir no editor
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
