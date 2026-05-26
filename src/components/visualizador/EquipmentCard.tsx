import { Badge } from "@/components/ui/badge";
import { Box } from "lucide-react";

interface Props {
  nome: string;
  codigo: string;
  categoriaLabel: string;
  cor: string;
  has3d: boolean;
  onClick?: () => void;
}

export default function EquipmentCard({
  nome,
  codigo,
  categoriaLabel,
  cor,
  has3d,
  onClick,
}: Props) {
  const disabled = !has3d;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Modelo 3D não disponível" : undefined}
      className={`group text-left bg-card border rounded-xl p-4 flex flex-col gap-3 aspect-square transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:shadow-lg hover:scale-[1.02] cursor-pointer"
      }`}
    >
      <div
        className="w-20 h-20 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: cor }}
      >
        <Box className="w-10 h-10 text-white/80" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground font-mono">{codigo}</div>
        <div className="font-medium text-sm leading-snug line-clamp-2">{nome}</div>
        <div className="text-xs text-muted-foreground mt-1">{categoriaLabel}</div>
      </div>
      {has3d && (
        <Badge variant="secondary" className="w-fit text-xs">
          3D disponível
        </Badge>
      )}
    </button>
  );
}
