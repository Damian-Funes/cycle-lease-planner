import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";
const WABA_ID = "1343365772695967";
const PHONE_ID = "162008925688407";
const SEIS_DIGITOS = /^\d{6}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function graph(method: "GET" | "POST", path: string, token: string, body?: unknown) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

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

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const acao = input?.acao;

  let r;
  switch (acao) {
    case "pedir_codigo":
      r = await graph("POST", `${PHONE_ID}/request_code`, token, { code_method: "VOICE", language: "pt_BR" });
      break;
    case "confirmar_codigo": {
      const code = String(input.code ?? "");
      if (!SEIS_DIGITOS.test(code)) return json({ error: "code deve ter 6 dígitos." }, 400);
      r = await graph("POST", `${PHONE_ID}/verify_code`, token, { code });
      break;
    }
    case "registrar": {
      const pin = String(input.pin ?? "");
      if (!SEIS_DIGITOS.test(pin)) return json({ error: "pin deve ter 6 dígitos." }, 400);
      r = await graph("POST", `${PHONE_ID}/register`, token, { messaging_product: "whatsapp", pin });
      break;
    }
    case "conectar_app":
      r = await graph("POST", `${WABA_ID}/subscribed_apps`, token);
      break;
    case "status":
      r = await graph("GET", `${PHONE_ID}?fields=display_phone_number,verified_name,status,code_verification_status,quality_rating,platform_type,name_status,throughput,health_status`, token);
      break;
    default:
      return json({ error: "Ação desconhecida." }, 400);
  }

  // Só a ação e o status HTTP vão para o log; nunca token, código ou PIN.
  if (!r.ok) console.error(`whatsapp-ativar: ${acao} -> Meta ${r.status}`);
  return json(r, r.ok ? 200 : r.status);
});
