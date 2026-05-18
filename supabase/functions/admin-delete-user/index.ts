import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Apenas admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body?.user_id;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (targetUserId === user.id) {
      return new Response(JSON.stringify({ error: "Não pode excluir a si mesmo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set responsavel_id = NULL em todos os registros vinculados (admin reatribui depois)
    const tables = [
      "organizacoes", "pessoas", "oportunidades", "atividades",
      "orcamentos", "propostas", "orcamentos_reforma",
    ];
    const orfaos: Record<string, number> = {};
    for (const t of tables) {
      const { data: updated, error: updErr } = await admin
        .from(t)
        .update({ responsavel_id: null })
        .eq("responsavel_id", targetUserId)
        .select("id");
      if (updErr) {
        return new Response(JSON.stringify({
          error: `Falha ao desvincular ${t}: ${updErr.message}`,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (updated && updated.length > 0) orfaos[t] = updated.length;
    }

    // Cleanup dependent rows that are safe to delete
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("usuario_estados").delete().eq("user_id", targetUserId);
    await admin.from("google_integration_tokens").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("user_id", targetUserId);

    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, orfaos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
