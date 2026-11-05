import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";
const WHATSAPP_WABA_ID = "1343365772695967";
const WHATSAPP_PHONE_NUMBER_ID = "162008925688407";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  // Nunca devolver/logar o token; o corpo da Meta não o contém.
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: claims.claims.sub,
    _role: "admin",
  });
  if (roleError || !isAdmin) return json({ error: "Apenas administradores." }, 403);

  const token = Deno.env.get("WHATSAPP_TOKEN");
  if (!token) return json({ error: "Secret WHATSAPP_TOKEN não configurado." }, 500);

  const [numero, waba, numeros] = await Promise.all([
    graphGet(`${WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,status,code_verification_status,quality_rating,platform_type,name_status,throughput,health_status`, token),
    graphGet(`${WHATSAPP_WABA_ID}?fields=name,account_review_status,business_verification_status,health_status,ownership_type`, token),
    graphGet(`${WHATSAPP_WABA_ID}/phone_numbers`, token),
  ]);

  if (!numero.ok || !waba.ok || !numeros.ok) {
    console.error("whatsapp-status: Meta retornou erro", numero.status, waba.status, numeros.status);
  }

  return json({
    ok: numero.ok && waba.ok && numeros.ok,
    phone_number: numero,
    waba,
    phone_numbers: numeros,
  });
});
