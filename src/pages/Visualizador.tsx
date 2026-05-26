import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import EquipmentCard from "@/components/visualizador/EquipmentCard";
import { CATEGORIAS } from "@/lib/equipamentos";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Box, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EquipRow {
  id: string;
  codigo: string;
  descricao: string;
  modelo_3d_url: string | null;
  categoria: string | null;
  cor_categoria: string | null;
}

export default function Visualizador() {
  const navigate = useNavigate();
  const [items, setItems] = useState<EquipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("todas");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id, codigo, descricao, modelo_3d_url, categoria, cor_categoria")
        .eq("ativo", true)
        .order("descricao", { ascending: true });
      if (!error && data) setItems(data as EquipRow[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => (cat === "todas" ? true : it.categoria === cat))
      .filter((it) =>
        !q
          ? true
          : it.descricao?.toLowerCase().includes(q) || it.codigo?.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const a3 = a.modelo_3d_url ? 0 : 1;
        const b3 = b.modelo_3d_url ? 0 : 1;
        if (a3 !== b3) return a3 - b3;
        return (a.descricao || "").localeCompare(b.descricao || "");
      });
  }, [items, search, cat]);

  const catLabel = (key: string | null) =>
    CATEGORIAS.find((c) => c.value === key)?.label || "Sem categoria";
  const catCor = (it: EquipRow) =>
    it.cor_categoria ||
    CATEGORIAS.find((c) => c.value === it.categoria)?.cor ||
    "#888780";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Início
            </Button>
            <div className="flex items-center gap-2">
              <Box className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">Visualizador 3D</h1>
            </div>
          </div>
          <AppHeader />
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-md"
          />
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            Nenhum equipamento encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((it) => (
              <EquipmentCard
                key={it.id}
                nome={it.descricao}
                codigo={it.codigo}
                categoriaLabel={catLabel(it.categoria)}
                cor={catCor(it)}
                has3d={!!it.modelo_3d_url}
                onClick={() => navigate(`/visualizador/${it.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
