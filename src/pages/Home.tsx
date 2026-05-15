import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FileText, Receipt, FolderOpen, Package, LayoutGrid, Wrench, Users, KanbanSquare, Building2, User, CheckSquare, BarChart3 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useAtividadesBadge } from "@/hooks/useAtividadesBadge";
import CrmWidgets from "@/components/CrmWidgets";

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
  {
    title: "Layouts",
    desc: "Vista em planta dos projetos",
    icon: LayoutGrid,
    to: "/layouts",
    color: "bg-teal-500/10 text-teal-600",
  },
  {
    title: "Reforma",
    desc: "Projetos de reforma e adequação",
    icon: Wrench,
    to: "/reforma",
    color: "bg-rose-500/10 text-rose-600",
  },
  {
    title: "Organizações",
    desc: "Empresas e contatos (CRM)",
    icon: Building2,
    to: "/organizacoes",
    color: "bg-cyan-500/10 text-cyan-600",
  },
  {
    title: "Pessoas",
    desc: "Contatos individuais",
    icon: User,
    to: "/pessoas",
    color: "bg-sky-500/10 text-sky-600",
  },
  {
    title: "CRM",
    desc: "Pipeline comercial e oportunidades",
    icon: KanbanSquare,
    to: "/crm",
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    title: "Atividades",
    desc: "Sua inbox de tarefas e follow-ups",
    icon: CheckSquare,
    to: "/atividades",
    color: "bg-orange-500/10 text-orange-600",
    badgeKey: "atividades",
  },
  {
    title: "Relatórios",
    desc: "Forecast, pipeline health e performance",
    icon: BarChart3,
    to: "/relatorios",
    color: "bg-violet-500/10 text-violet-600",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const ativBadge = useAtividadesBadge();
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

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <section>
          <h2 className="text-lg font-semibold mb-4">Visão geral</h2>
          <CrmWidgets />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">O que você quer fazer?</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c: any) => {
            const Icon = c.icon;
            const showBadge = c.badgeKey === "atividades" && ativBadge > 0;
            return (
              <Card
                key={c.title}
                onClick={() => navigate(c.to)}
                className="p-6 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group relative"
              >
                {showBadge && (
                  <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center">
                    {ativBadge}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-lg ${c.color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </Card>
            );
          })}
        </div>
        </section>
      </main>
    </div>
  );
}
