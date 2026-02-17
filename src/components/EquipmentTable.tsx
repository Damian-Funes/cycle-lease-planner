import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemProjeto, calcEntrada } from "@/lib/equipamentos";
import { formatBRL } from "@/lib/smartcycle";
import { Package } from "lucide-react";

interface Props {
  itens: ItemProjeto[];
}

export default function EquipmentTable({ itens }: Props) {
  if (itens.length === 0) return null;
  const entrada = calcEntrada(itens);

  return (
    <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" /> Equipamentos do Projeto
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left p-2 font-medium">Código</th>
                <th className="text-left p-2 font-medium">Descrição</th>
                <th className="text-center p-2 font-medium">Qtd</th>
                <th className="text-right p-2 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.equipamento_id} className="border-t">
                  <td className="p-2 font-medium">{item.codigo}</td>
                  <td className="p-2 text-muted-foreground">{item.descricao}</td>
                  <td className="p-2 text-center">{item.quantidade}</td>
                  <td className="p-2 text-right font-semibold">{formatBRL(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-secondary/50">
                <td colSpan={3} className="p-2 font-semibold text-right">Custo Total (Entrada):</td>
                <td className="p-2 text-right font-bold text-primary">{formatBRL(entrada)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
