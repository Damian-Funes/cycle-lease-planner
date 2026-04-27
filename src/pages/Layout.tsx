import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import AppHeader from "@/components/AppHeader";

export default function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            <div className="font-semibold">Layout</div>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-16">
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center mx-auto mb-6">
            <LayoutGrid className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Em breve</h1>
          <p className="text-muted-foreground">
            Esta área está em desenvolvimento. Em breve você poderá gerenciar layouts dos projetos por aqui.
          </p>
        </Card>
      </main>
    </div>
  );
}
