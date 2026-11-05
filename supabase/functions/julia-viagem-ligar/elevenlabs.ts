export function configurarElevenLabs(env: { key?: string; agent?: string; phone?: string; telefonia?: string }) {
  const key = env.key?.trim() ?? '';
  const originalAgent = env.agent?.trim() ?? '';
  const agent = originalAgent.match(/agent_[A-Za-z0-9]+/)?.[0] ?? originalAgent;
  const phone = env.phone?.trim() ?? '';
  const telefonia = env.telefonia?.trim().toLowerCase() || 'twilio';
  if (!key || !agent || !phone) throw new Error('Configure os secrets da ElevenLabs para viagens.');
  if (!['twilio', 'sip'].includes(telefonia)) throw new Error('ELEVENLABS_TELEFONIA deve ser twilio ou sip.');
  return { key, agent, phone, endpoint: `https://api.elevenlabs.io/v1/convai/${telefonia === 'sip' ? 'sip-trunk' : 'twilio'}/outbound-call` };
}

export function erroElevenLabs(status: number, body: string, secrets: string[]) {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    const value = parsed?.detail ?? parsed?.message ?? parsed?.error ?? parsed;
    detail = typeof value === 'string' ? value : JSON.stringify(value);
  } catch { /* Provedor pode retornar texto em vez de JSON. */ }
  // Redigir antes de truncar, inclusive secrets ecoados em JSON/URLs.
  for (const secret of secrets.map(s => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const encoded of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
      detail = detail.split(encoded).join('[redigido]');
    }
  }
  detail = detail.replace(/("?(?:xi-api-key|api[_-]?key|authorization|access_token|token|secret)"?\s*[:=]\s*)("[^"]*"|[^\s,;}]+)/gi, '$1[redigido]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redigido]')
    .replace(/\+\d{10,15}\b/g, '[telefone redigido]')
    .replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  return `ElevenLabs recusou a ligação (HTTP ${status})${detail ? `: ${detail}` : '.'}`.slice(0, 1000);
}