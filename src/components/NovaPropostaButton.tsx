import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilePlus, FileText, Receipt, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  onNovoAluguel?: () => void;
  onNovoOrcamento?: () => void;
}

export default function NovaPropostaButton({ onNovoAluguel, onNovoOrcamento }: Props) {
  const navigate = useNavigate();

  const handleAluguel = () => {
    if (onNovoAluguel) onNovoAluguel();
    else navigate("/?novo=1");
  };
  const handleOrcamento = () => {
    if (onNovoOrcamento) onNovoOrcamento();
    else navigate("/orcamento?novo=1");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <FilePlus className="w-4 h-4" /> Nova Proposta <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleAluguel} className="gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Aluguel (SmartCycle)</p>
            <p className="text-xs text-muted-foreground">Contrato de 10 anos</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleOrcamento} className="gap-2">
          <Receipt className="w-4 h-4 text-amber-600" />
          <div>
            <p className="text-sm font-medium">Orçamento</p>
            <p className="text-xs text-muted-foreground">Venda direta de equipamentos</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
