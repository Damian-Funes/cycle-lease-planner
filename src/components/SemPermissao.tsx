import { Link } from "react-router-dom";
import { Lock, SearchX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Icone = "lock" | "search" | "shield";

interface Props {
  titulo?: string;
  mensagem?: string;
  ctaText?: string;
  ctaHref?: string;
  icone?: Icone;
}

const ICONS: Record<Icone, typeof Lock> = {
  lock: Lock,
  search: SearchX,
  shield: ShieldAlert,
};

export default function SemPermissao({
  titulo = "Acesso negado",
  mensagem = "Você não tem permissão para acessar esta página.",
  ctaText = "Voltar para a Home",
  ctaHref = "/",
  icone = "lock",
}: Props) {
  const Icon = ICONS[icone];
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Icon className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{mensagem}</p>
        <Link to={ctaHref}>
          <Button className="mt-2">{ctaText}</Button>
        </Link>
      </Card>
    </div>
  );
}
