import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EquipmentViewer3D, {
  type EquipmentViewer3DApi,
  type ViewerPreset,
} from "@/components/visualizador/EquipmentViewer3D";
import ViewerControls from "@/components/visualizador/ViewerControls";
import { CATEGORIAS } from "@/lib/equipamentos";
import { Loader2, ArrowLeft } from "lucide-react";

interface EquipDetail {
  id: string;
  codigo: string;
  descricao: string;
  modelo_3d_url: string | null;
  glb_rotacao_x: number | null;
  glb_rotacao_z: number | null;
  categoria: string | null;
  cor_categoria: string | null;
}

export default function VisualizadorDetalhe() {
  const { equipamentoId } = useParams();
  const navigate = useNavigate();
  const [equip, setEquip] = useState<EquipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(true);
  const apiRef = useRef<EquipmentViewer3DApi>(null);

  useEffect(() => {
    if (!equipamentoId) return;
    (async () => {
      const { data } = await supabase
        .from("equipamentos")
        .select(
          "id, codigo, descricao, modelo_3d_url, glb_rotacao_x, glb_rotacao_z, categoria, cor_categoria",
        )
        .eq("id", equipamentoId)
        .single();
      setEquip(data as EquipDetail | null);
      setLoading(false);
    })();
  }, [equipamentoId]);

  const catLabel =
    CATEGORIAS.find((c) => c.value === equip?.categoria)?.label || "Sem categoria";
  const cor =
    equip?.cor_categoria ||
    CATEGORIAS.find((c) => c.value === equip?.categoria)?.cor ||
    "#888780";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1d1a] text-white">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!equip || !equip.modelo_3d_url) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1a1d1a] text-white gap-4 p-6 text-center">
        <p className="text-lg">Modelo 3D ainda não disponível para este equipamento.</p>
        <button
          onClick={() => navigate("/visualizador")}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>
    );
  }

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    apiRef.current?.setAutoRotate(next);
  };

  const handlePreset = (p: ViewerPreset) => {
    apiRef.current?.goToPreset(p);
    setPlaying(false);
    if (p === "iso") apiRef.current?.reset();
  };

  // Convert deg → rad (banco armazena em graus em outros usos; aqui o spec diz radianos
  // — mas glb_rotacao_x é integer, tratamos como graus se for >2π)
  const rx = ((equip.glb_rotacao_x ?? 0) * Math.PI) / 180;
  const rz = ((equip.glb_rotacao_z ?? 0) * Math.PI) / 180;

  return (
    <div className="fixed inset-0 bg-[#1a1d1a] overflow-hidden">
      <EquipmentViewer3D
        ref={apiRef}
        modeloUrl={equip.modelo_3d_url}
        rotacaoX={rx}
        rotacaoZ={rz}
        onAutoRotateChange={(on) => setPlaying(on)}
      />
      <ViewerControls
        nome={equip.descricao}
        categoriaLabel={catLabel}
        categoriaCor={cor}
        isPlaying={playing}
        onTogglePlay={togglePlay}
        onPreset={handlePreset}
      />
    </div>
  );
}
