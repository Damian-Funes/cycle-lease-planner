import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useAtividadesBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetch = async () => {
    if (!user) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { count: c } = await (supabase as any)
      .from("atividades")
      .select("id", { count: "exact", head: true })
      .eq("responsavel_id", user.id)
      .eq("concluida", false)
      .eq("evento_automatico", false)
      .lte("data_inicio", end.toISOString());
    setCount(c || 0);
  };

  useEffect(() => {
    fetch();
    if (!user) return;
    const ch = (supabase as any)
      .channel("ativ-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "atividades" }, fetch)
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  return count;
}
