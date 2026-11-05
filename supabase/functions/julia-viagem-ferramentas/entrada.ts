const simplificar = (texto: string) => texto.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const vazioSemantico = (valor: unknown) => typeof valor === 'string' && ['', 'nenhum', 'nenhuma', 'nenhuma citada', 'nao', 'n/a', 'nao se aplica', 'sem', '-'].includes(simplificar(valor));
function numeroBR(texto: string): number | undefined {
 const numero = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : /^[-+]?\d{1,3}(\.\d{3})+$/.test(texto) ? texto.replace(/\./g, '') : texto;
 return /^[-+]?\d+(\.\d+)?$/.test(numero) && Number.isFinite(Number(numero)) ? Number(numero) : undefined;
}
function sacosBR(valor: unknown): number | undefined {
 if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : undefined;
 if (typeof valor !== 'string') return undefined;
 const match = simplificar(valor).match(/^([-+]?\d[\d.,]*)\s*(milhoes|milhao|mil)?\s*(?:de\s+)?(?:sacos?)?$/);
 if (!match) return undefined;
 const numero = numeroBR(match[1]);
 const total = numero === undefined ? undefined : numero * (match[2] === 'mil' ? 1000 : match[2] ? 1000000 : 1);
 return total !== undefined && Number.isFinite(total) && total >= 0 ? total : undefined;
}
function dataProximoPasso(valor: unknown, hoje: string): string | undefined {
 if (typeof valor !== 'string') return undefined;
 let data: string;
 const br = valor.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
 if (br) {
  let ano = br[3] ?? hoje.slice(0,4);
  data = `${ano}-${br[2]}-${br[1]}`;
  if (!br[3] && data < hoje) { ano = String(Number(ano) + 1); data = `${ano}-${br[2]}-${br[1]}`; }
 } else if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) data = valor;
 else return undefined;
 const instante = new Date(`${data}T12:00:00Z`);
 return Number.isFinite(instante.getTime()) && instante.toISOString().slice(0,10) === data && data >= hoje ? data : undefined;
}
/** Drop optional noise; preserve mandatory fields for strict validation. */
export function normalizarBody(body: unknown, hojeBRT = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), avisos: string[] = []): unknown {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
 const resultado: Record<string, unknown> = {};
 for (const [campo, original] of Object.entries(body)) {
  let valor = typeof original === 'string' ? original.trim() : original;
  if (valor === null || valor === undefined || (campo !== 'visitada' && vazioSemantico(valor)) || valor === '' || (Array.isArray(valor) && valor.length === 0)) continue;
  if (campo === 'objecoes' && Array.isArray(valor)) { valor = valor.filter(item => item != null && !vazioSemantico(item)); if (valor.length === 0) continue; }
  if (campo === 'sacos_safra') valor = sacosBR(valor);
  if (campo === 'proximo_passo_data') valor = dataProximoPasso(valor, hojeBRT);
  if (valor === undefined) { avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: valor inválido ou data passada.`); continue; }
  if (campo === 'valor' && typeof valor === 'string') valor = numeroBR(valor) ?? valor;
  if (campo === 'interesse' && typeof valor === 'string') valor = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (campo === 'uf' && typeof valor === 'string') valor = valor.toUpperCase();
  if (campo === 'visitada' && typeof valor === 'string') {
   const booleano = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
   if (['true', 'sim'].includes(booleano)) valor = true;
   else if (['false', 'nao'].includes(booleano)) valor = false;
  }
  resultado[campo] = valor;
 }
 if (resultado.visitada === true) delete resultado.motivo;
 if (resultado.visitada === false) delete resultado.resultado;
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