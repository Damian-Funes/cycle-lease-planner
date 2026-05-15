import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GoogleIntegration {
  id: string;
  user_id: string;
  google_email: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export function useGoogleIntegration() {
  const [integration, setIntegration] = useState<GoogleIntegration | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIntegration(null); setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("google_integration_tokens")
      .select("id, user_id, google_email, expires_at, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setIntegration((data as any) || null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("google-oauth-start");
    if (error || !data?.authUrl) {
      toast.error("Falha ao iniciar conexão", { description: error?.message });
      return;
    }
    window.location.href = data.authUrl;
  }, []);

  const disconnect = useCallback(async () => {
    if (!integration) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await (supabase as any)
      .from("google_integration_tokens").delete().eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Google desconectado");
    setIntegration(null);
  }, [integration]);

  const syncAtividade = useCallback(async (atividade_id: string, action: "create" | "update" | "delete") => {
    const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
      body: { action, atividade_id },
    });
    if (error) {
      console.error("[google-sync]", error);
      return { ok: false, error: error.message };
    }
    return data as any;
  }, []);

  return { integration, loading, refresh, connect, disconnect, syncAtividade, isConnected: !!integration };
}
