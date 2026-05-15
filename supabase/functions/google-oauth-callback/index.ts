import { createClient } from 'npm:@supabase/supabase-js@2'

async function verifyState(state: string, secret: string): Promise<string | null> {
  try {
    const parts = state.split('.')
    if (parts.length !== 4) return null
    const [userId, nonce, ts, sigB64] = parts
    const payload = `${userId}.${nonce}.${ts}`
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload))
    if (!ok) return null
    // expira em 15 min
    if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) return null
    return userId
  } catch {
    return null
  }
}

function htmlRedirect(target: string, message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Conectando…</title>
<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#111}</style>
<div><h2>${message}</h2><p>Redirecionando…</p></div>
<script>window.location.replace(${JSON.stringify(target)});</script>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  // Definir destino do redirect (origem do app). Se houver custom domain, usar; senão fallback.
  const appBase = Deno.env.get('APP_BASE_URL') || 'https://crmls.com.br'
  const successUrl = `${appBase}/configuracoes/integracoes?google=connected`
  const errorUrl = (msg: string) => `${appBase}/configuracoes/integracoes?google=error&message=${encodeURIComponent(msg)}`

  if (errorParam) return htmlRedirect(errorUrl(errorParam), 'Falha na autorização')
  if (!code || !state) return htmlRedirect(errorUrl('missing_params'), 'Parâmetros ausentes')

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userId = await verifyState(state, serviceKey)
  if (!userId) return htmlRedirect(errorUrl('invalid_state'), 'State inválido')

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')!

  // Exchange code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    console.error('Token exchange failed', tokenData)
    return htmlRedirect(errorUrl(tokenData.error || 'token_exchange_failed'), 'Erro ao obter tokens')
  }

  const { access_token, refresh_token, expires_in, scope, token_type } = tokenData

  // Pegar email do usuário Google
  let googleEmail: string | null = null
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (uRes.ok) {
      const u = await uRes.json()
      googleEmail = u.email
    }
  } catch (_) { /* noop */ }

  const expires_at = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString()

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // Verifica se já existe token p/ refresh_token (Google só envia refresh na primeira vez)
  const { data: existing } = await admin
    .from('google_integration_tokens').select('refresh_token').eq('user_id', userId).maybeSingle()

  const finalRefresh = refresh_token || existing?.refresh_token
  if (!finalRefresh) {
    return htmlRedirect(errorUrl('missing_refresh_token'), 'Refresh token ausente — desconecte e tente novamente')
  }

  const { error: upsertErr } = await admin.from('google_integration_tokens').upsert({
    user_id: userId,
    google_email: googleEmail,
    access_token,
    refresh_token: finalRefresh,
    token_type: token_type || 'Bearer',
    scope,
    expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (upsertErr) {
    console.error('Upsert failed', upsertErr)
    return htmlRedirect(errorUrl('save_failed'), 'Erro ao salvar tokens')
  }

  return htmlRedirect(successUrl, 'Conectado com sucesso!')
})
