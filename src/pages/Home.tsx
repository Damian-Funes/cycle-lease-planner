import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FileText, Receipt, FolderOpen, Package } from "lucide-react";
import AppHeader from "@/components/AppHeader";

const cards = [
  {
    title: "Nova Proposta de Aluguel",
    desc: "Calculadora SmartCycle · Contrato 10 anos",
    icon: FileText,
    to: "/smartcycle?novo=1",
    color: "bg-primary/10 text-primary",
  },
  {
    title: "Novo Orçamento",
    desc: "Venda direta de equipamentos",
    icon: Receipt,
    to: "/orcamento?novo=1",
    color: "bg-amber-500/10 text-amber-600",
  },
  {
    title: "Propostas",
    desc: "Ver aluguéis e orçamentos salvos",
    icon: FolderOpen,
    to: "/smartcycle?propostas=1",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    title: "Catálogo",
    desc: "Equipamentos e preços",
    icon: Package,
    to: "/catalogo",
    color: "bg-purple-500/10 text-purple-600",
  },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">LS</div>
            <div>
              <div className="font-semibold leading-tight">SmartCycle LS</div>
              <div className="text-xs text-muted-foreground leading-tight">Calculadora Comercial</div>
            </div>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">O que você quer fazer?</h1>
          <p className="text-muted-foreground">Escolha uma das opções abaixo para começar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card
                key={c.title}
                onClick={() => navigate(c.to)}
                className="p-6 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              >
                <div className={`w-12 h-12 rounded-lg ${c.color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
