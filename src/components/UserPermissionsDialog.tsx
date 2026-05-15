import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";

const ROLES: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "gerente_comercial", label: "Gerente Comercial" },
  { value: "comercial", label: "Comercial" },
  { value: "rtv", label: "RTV" },
  { value: "marketing", label: "Marketing" },
  { value: "engenharia", label: "Engenharia" },
  { value: "financeiro", label: "Financeiro" },
  { value: "operacao", label: "Operação" },
  { value: "viewer", label: "Viewer" },
  { value: "user", label: "User (legado)" },
];

interface Estado { id: string; sigla: string; nome: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userLabel: string;
}

export default function UserPermissionsDialog({ open, onOpenChange, userId, userLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [roles, setRoles] = useState<Set<AppRole>>(new Set());
  const [estadoIds, setEstadoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [estRes, rolesRes, ueRes] = await Promise.all([
        supabase.from("estados").select("id, sigla, nome").eq("ativo", true).order("sigla"),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("usuario_estados").select("estado_id").eq("user_id", userId),
      ]);
      setEstados((estRes.data || []) as Estado[]);
      setRoles(new Set((rolesRes.data || []).map((r: any) => r.role as AppRole)));
      setEstadoIds(new Set((ueRes.data || []).map((u: any) => u.estado_id as string)));
      setLoading(false);
    })();
  }, [open, userId]);

  const toggleRole = (r: AppRole) => {
    const n = new Set(roles);
    n.has(r) ? n.delete(r) : n.add(r);
    setRoles(n);
  };
  const toggleEstado = (id: string) => {
    const n = new Set(estadoIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setEstadoIds(n);
  };

  const salvar = async () => {
    setSaving(true);
    try {
      // sync roles
      const { data: cur } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const atuais = new Set((cur || []).map((r: any) => r.role as AppRole));
      const adicionar = [...roles].filter((r) => !atuais.has(r));
      const remover = [...atuais].filter((r) => !roles.has(r));
      if (remover.length) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).in("role", remover);
        if (error) throw error;
      }
      if (adicionar.length) {
        const { error } = await supabase.from("user_roles").insert(adicionar.map((role) => ({ user_id: userId, role })));
        if (error) throw error;
      }

      // sync estados
      const { data: curE } = await supabase.from("usuario_estados").select("estado_id").eq("user_id", userId);
      const atuaisE = new Set((curE || []).map((r: any) => r.estado_id as string));
      const addE = [...estadoIds].filter((id) => !atuaisE.has(id));
      const rmE = [...atuaisE].filter((id) => !estadoIds.has(id));
      if (rmE.length) {
        const { error } = await supabase.from("usuario_estados").delete().eq("user_id", userId).in("estado_id", rmE);
        if (error) throw error;
      }
      if (addE.length) {
        const { error } = await supabase.from("usuario_estados").insert(addE.map((estado_id) => ({ user_id: userId, estado_id })));
        if (error) throw error;
      }

      toast.success("Permissões atualizadas");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões — {userLabel}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="font-semibold mb-3 text-sm">Funções (roles)</h3>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={roles.has(r.value)} onCheckedChange={() => toggleRole(r.value)} />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Estados cobertos</h3>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEstadoIds(new Set(estados.map((e) => e.id)))}>
                    Todos
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEstadoIds(new Set())}>
                    Nenhum
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {estados.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer" title={e.nome}>
                    <Checkbox checked={estadoIds.has(e.id)} onCheckedChange={() => toggleEstado(e.id)} />
                    <span>{e.sigla}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Comerciais e RTVs só veem dados das organizações nos estados marcados.
              </p>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
