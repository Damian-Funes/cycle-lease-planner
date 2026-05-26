import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize, Minimize, Pause, Play } from "lucide-react";
import type { ViewerPreset } from "./EquipmentViewer3D";

interface Props {
  nome: string;
  categoriaLabel: string;
  categoriaCor: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPreset: (p: ViewerPreset) => void;
}

export default function ViewerControls({
  nome,
  categoriaLabel,
  categoriaCor,
  isPlaying,
  onTogglePlay,
  onPreset,
}: Props) {
  const navigate = useNavigate();
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };

  const btn =
    "backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-all duration-200 rounded-lg";

  return (
    <>
      {/* Top-left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        <button
          onClick={() => navigate("/visualizador")}
          className={`${btn} px-3 py-2 flex items-center gap-2 text-sm w-fit`}
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="backdrop-blur-md bg-black/30 border border-white/10 rounded-lg px-4 py-3">
          <div className="text-white font-semibold text-lg leading-tight">{nome}</div>
          <div className="text-sm mt-1" style={{ color: categoriaCor }}>
            {categoriaLabel}
          </div>
        </div>
      </div>

      {/* Top-right */}
      <div className="absolute top-4 right-4 z-10">
        <button onClick={toggleFullscreen} className={`${btn} p-3`} aria-label="Tela cheia">
          {isFull ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      {/* Bottom-center presets */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {(
          [
            ["top", "Topo"],
            ["front", "Frente"],
            ["side", "Lateral"],
            ["iso", "Iso"],
          ] as [ViewerPreset, string][]
        ).map(([k, label]) => (
          <button key={k} onClick={() => onPreset(k)} className={`${btn} px-4 py-2 text-sm`}>
            {label}
          </button>
        ))}
      </div>

      {/* Bottom-right play/pause */}
      <div className="absolute bottom-6 right-6 z-10">
        <button
          onClick={onTogglePlay}
          className={`h-14 w-14 rounded-full flex items-center justify-center transition-all duration-200 border ${
            isPlaying
              ? "bg-[#5BA8AE] border-transparent text-white hover:bg-[#4d9097]"
              : "backdrop-blur-md bg-white/10 border-white/20 text-white hover:bg-white/20"
          }`}
          aria-label={isPlaying ? "Pausar rotação" : "Iniciar rotação"}
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
      </div>
    </>
  );
}
