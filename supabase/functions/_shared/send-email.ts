// Shared email sender via Resend with safe fallback.
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "CRM LS <noreply@crmls.com.br>";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export interface SendEmailArgs {
  tipo: string;
  to: string;
  subject: string;
  html: string;
  destinatarioUserId?: string | null;
  referenciaId?: string | null;
  referenciaTipo?: string | null;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; status: string; erro?: string }> {
  const { tipo, to, subject, html, destinatarioUserId, referenciaId, referenciaTipo } = args;

  let status = "enviado";
  let erro: string | undefined;

  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SIMULADO] Para: ${to} | Assunto: ${subject}`);
    status = "simulado";
  } else {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        erro = `Resend ${resp.status}: ${body.slice(0, 500)}`;
        status = "falha";
        console.log(`[EMAIL SIMULADO - fallback] Para: ${to} | Assunto: ${subject} | Erro: ${erro}`);
      }
    } catch (e) {
      erro = String(e);
      status = "falha";
      console.log(`[EMAIL SIMULADO - exception] Para: ${to} | Assunto: ${subject} | Erro: ${erro}`);
    }
  }

  await supabase.from("email_notifications_log").insert({
    tipo,
    destinatario_user_id: destinatarioUserId ?? null,
    destinatario_email: to,
    assunto: subject,
    status,
    erro: erro ?? null,
    referencia_id: referenciaId ?? null,
    referencia_tipo: referenciaTipo ?? null,
  });

  return { ok: status !== "falha", status, erro };
}

export function htmlWrap(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#059669;margin:0 0 16px">${title}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="font-size:12px;color:#6b7280">CRM LS — <a href="https://crmls.com.br" style="color:#059669">crmls.com.br</a></p>
  </body></html>`;
}

export async function isPrefEnabled(userId: string, key: string): Promise<boolean> {
  const { data } = await supabase
    .from("email_notification_preferences")
    .select(key)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true; // default ON
  // @ts-ignore dynamic key
  return data[key] !== false;
}

export { supabase as adminClient };
