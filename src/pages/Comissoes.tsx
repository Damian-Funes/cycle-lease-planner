import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import ComissaoCard from "@/components/ComissaoCard";
import { Button } from "@/components/ui/button";

export default function Comissoes() {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="ghost" size="icon" aria-label="Voltar ao início"><Link to="/"><ArrowLeft className="w-4 h-4" /></Link></Button>
            <h1 className="text-xl font-semibold">Comissões</h1>
          </div>
          <AppHeader />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <ComissaoCard />
      </main>
    </div>
  );
}
