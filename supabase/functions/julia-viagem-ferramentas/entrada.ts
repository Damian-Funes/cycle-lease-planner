/** Normalize provider values without weakening the validation that follows. */
export function normalizarBody(body: unknown): unknown {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
 const resultado: Record<string, unknown> = {};
 for (const [campo, original] of Object.entries(body)) {
  let valor = typeof original === 'string' ? original.trim() : original;
  if (valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0)) continue;
  if ((campo === 'sacos_safra' || campo === 'valor') && typeof valor === 'string') {
   // A dotted three-digit group is a Brazilian thousands separator; comma is decimal.
   const numero = valor.includes(',') ? valor.replace(/\./g, '').replace(',', '.') : /^[-+]?\d{1,3}(\.\d{3})+$/.test(valor) ? valor.replace(/\./g, '') : valor;
   if (/^[-+]?\d+(\.\d+)?$/.test(numero) && Number.isFinite(Number(numero))) valor = Number(numero);
  }
  if (campo === 'interesse' && typeof valor === 'string') valor = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (campo === 'uf' && typeof valor === 'string') valor = valor.toUpperCase();
  if (campo === 'visitada' && typeof valor === 'string') {
   const booleano = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
   if (['true', 'sim'].includes(booleano)) valor = true;
   else if (['false', 'nao'].includes(booleano)) valor = false;
  }
  resultado[campo] = valor;
 }
 return resultado;
}

/** Never use Zod's raw messages: enum errors can include submitted values. */
export function mensagensValidacao(issues: { path: (string | number)[]; code: string }[]) {
 return issues.map(issue => ({ campo: issue.path.join('.') || 'body', mensagem: issue.code === 'too_big' ? 'Excede o limite permitido.' : issue.code === 'too_small' ? 'Valor abaixo do mínimo ou campo vazio.' : 'Valor ausente ou formato inválido.' }));
}

export function fraseValidacao(issues: { path: (string | number)[]; code: string }[]) {
 const campo = issues[0]?.path.join('.') || 'body';
 const nomes: Record<string, string> = { body: 'dados enviados', acao: 'ação', ligacao_id: 'identificador da ligação', rota_id: 'identificador da viagem', parada_id: 'identificador da parada', visitada: 'visita realizada', sacos_safra: 'sacos da safra', interesse: 'interesse', uf: 'UF', valor: 'valor', proximo_passo_data: 'data do próximo passo' };
 return `Confira o campo ${nomes[campo] ?? campo.replace(/_/g, ' ')}: valor ausente ou inválido.`;
}