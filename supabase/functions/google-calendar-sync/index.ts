import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface SyncRequest {
  action: 'create' | 'update' | 'delete'
  atividade_id: string
}

async function getValidAccessToken(admin: any, userId: string): Promise<{ access_token: string; google_email: string | null } | null> {
  const { data: tok } = await admin
    .from('google_integration_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!tok) return null

  const expiresAt = new Date(tok.expires_at).getTime()
  if (expiresAt - Date.now() > 60_000) {
    return { access_token: tok.access_token, google_email: tok.google_email }
  }

  // refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Refresh failed', data)
    return null
  }
  const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await admin.from('google_integration_tokens').update({
    access_token: data.access_token,
    expires_at: newExpires,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  return { access_token: data.access_token, google_email: tok.google_email }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token)
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const userId = claimsData.claims.sub

    const body: SyncRequest = await req.json()
    if (!body.action || !body.atividade_id) {
      return new Response(JSON.stringify({ error: 'Missing action or atividade_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const tok = await getValidAccessToken(admin, userId)
    if (!tok) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: ativ, error: ativErr } = await admin.from('atividades').select('*').eq('id', body.atividade_id).maybeSingle()
    if (ativErr || !ativ) {
      return new Response(JSON.stringify({ error: 'atividade_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const calendarId = 'primary'
    const startIso = ativ.data_inicio || ativ.data_atividade
    const dur = ativ.duracao_minutos || 30
    const endIso = new Date(new Date(startIso).getTime() + dur * 60_000).toISOString()

    const eventBody: any = {
      summary: ativ.titulo,
      description: ativ.descricao || '',
      start: { dateTime: startIso, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endIso, timeZone: 'America/Sao_Paulo' },
    }
    if (ativ.criar_meet) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `ls-${ativ.id}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    let url = baseUrl
    let method: 'POST' | 'PATCH' | 'DELETE' = 'POST'

    if (body.action === 'update' && ativ.google_event_id) {
      url = `${baseUrl}/${encodeURIComponent(ativ.google_event_id)}?conferenceDataVersion=1`
      method = 'PATCH'
    } else if (body.action === 'delete') {
      if (!ativ.google_event_id) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      url = `${baseUrl}/${encodeURIComponent(ativ.google_event_id)}`
      method = 'DELETE'
    } else {
      // create
      url = `${baseUrl}?conferenceDataVersion=1`
      method = 'POST'
    }

    const gRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'Content-Type': 'application/json',
      },
      body: method === 'DELETE' ? undefined : JSON.stringify(eventBody),
    })

    if (method === 'DELETE') {
      if (gRes.ok || gRes.status === 410 || gRes.status === 404) {
        await admin.from('atividades').update({
          google_event_id: null, google_meet_link: null, google_calendar_id: null,
          sincronizado_em: new Date().toISOString(), erro_sincronizacao: null,
        }).eq('id', ativ.id)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const txt = await gRes.text()
      await admin.from('atividades').update({ erro_sincronizacao: `delete: ${txt.slice(0, 500)}` }).eq('id', ativ.id)
      return new Response(JSON.stringify({ error: 'delete_failed', details: txt }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const gData = await gRes.json()
    if (!gRes.ok) {
      const msg = gData?.error?.message || 'google_api_error'
      await admin.from('atividades').update({ erro_sincronizacao: msg.slice(0, 500) }).eq('id', ativ.id)
      return new Response(JSON.stringify({ error: msg, details: gData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const meetLink = gData.hangoutLink ||
      gData.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
      null

    await admin.from('atividades').update({
      google_event_id: gData.id,
      google_calendar_id: calendarId,
      google_meet_link: meetLink,
      sincronizado_em: new Date().toISOString(),
      erro_sincronizacao: null,
    }).eq('id', ativ.id)

    return new Response(JSON.stringify({
      ok: true,
      google_event_id: gData.id,
      google_meet_link: meetLink,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
