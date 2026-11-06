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
export const SEGMENTOS = ['COOPERATIVAS','MULTINACIONAIS','SEMENTEIRA PRIVADA','PRODUTOR RURAL','REVENDA'] as const;
const UFS: Record<string,string> = { acre:'AC', alagoas:'AL', amapa:'AP', amazonas:'AM', bahia:'BA', ceara:'CE', 'distrito federal':'DF', 'espirito santo':'ES', goias:'GO', maranhao:'MA', 'mato grosso':'MT', 'mato grosso do sul':'MS', 'minas gerais':'MG', 'minas':'MG', para:'PA', paraiba:'PB', parana:'PR', pernambuco:'PE', piaui:'PI', 'rio de janeiro':'RJ', 'rio grande do norte':'RN', 'rio grande do sul':'RS', rondonia:'RO', roraima:'RR', 'santa catarina':'SC', 'sao paulo':'SP', sergipe:'SE', tocantins:'TO' };
/** "minas gerais" / "mg" → "MG"; desconhecido → undefined */
export function ufBR(valor: unknown): string | undefined {
 if (typeof valor !== 'string') return undefined;
 const s = simplificar(valor); if (/^[a-z]{2}$/.test(s)) return s.toUpperCase(); return UFS[s];
}
/** Aceita segmento falado sem acento/caixa/plural; fora da lista → undefined */
export function segmentoBR(valor: unknown): typeof SEGMENTOS[number] | undefined {
 if (typeof valor !== 'string') return undefined;
 const s = simplificar(valor).toUpperCase().replace(/S$/, '');
 return SEGMENTOS.find(x => x.replace(/S$/, '') === s || (s.includes('SEMENTEIRA') && x === 'SEMENTEIRA PRIVADA') || (s.includes('COOPERATIVA') && x === 'COOPERATIVAS') || (s.includes('PRODUTOR') && x === 'PRODUTOR RURAL') || (s.includes('MULTINACIONA') && x === 'MULTINACIONAIS'));
}
export const MOTIVOS_DESCARTE = ['fechou','nao_trata_semente','duplicada','outro'] as const;
/** Aceita o que a Júlia falar ("fechou", "não trabalha com semente", "duplicada"...) e mapeia para o código. */
export function motivoDescarteBR(valor: unknown): typeof MOTIVOS_DESCARTE[number] | undefined {
 const s = String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
 if (!s) return undefined;
 if ((MOTIVOS_DESCARTE as readonly string[]).includes(s)) return s as typeof MOTIVOS_DESCARTE[number];
 if (/fech|faliu|encerr/.test(s)) return 'fechou';
 if (/semente/.test(s)) return 'nao_trata_semente';
 if (/duplic|repetid|mesma empresa/.test(s)) return 'duplicada';
 return 'outro';
}
/** Telefone falado: mantém só dígitos (com DDD). Menos de 10 dígitos é inválido. */
export function telefoneBR(valor: unknown): string | undefined {
 const d = String(valor ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
 return d.length >= 10 && d.length <= 11 ? d : undefined;
}
function booleanoBR(valor: unknown): boolean | undefined {
 if (typeof valor === 'boolean') return valor;
 const b = String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 return ['true','sim'].includes(b) ? true : ['false','nao'].includes(b) ? false : undefined;
}
function normalizarCriar(criar: unknown, avisos: string[]): unknown {
 if (!criar || typeof criar !== 'object' || Array.isArray(criar)) return undefined;
 const r: Record<string, unknown> = {};
 for (const [k, v0] of Object.entries(criar)) {
  const v = typeof v0 === 'string' ? v0.trim() : v0;
  if (v === null || v === undefined || v === '' || vazioSemantico(v)) continue;
  if (k === 'uf') { const uf = ufBR(v); if (uf) r.uf = uf; else avisos.push('Campo UF não reconhecido.'); continue; }
  if (k === 'segmento') { const seg = segmentoBR(v); if (seg) r.segmento = seg; else avisos.push('Segmento descartado: fora da lista.'); continue; }
  r[k] = v;
 }
 return Object.keys(r).length ? r : undefined;
}
const CAMPOS_AVISO_VAZIO = ['contato_nome','contato_cargo','decisores','equipamento_atual','problema_principal','motivo_interesse','concorrente','proximo_passo'];
const CAMPOS_COMPLETAR = ['pessoa_nome','pessoa_cargo','pessoa_telefone','cidade','uf','descobrir_ate','sugerir_visita','visita_em','descartar_motivo','descartar_obs'];
/** acao=listar_organizacoes_incompletas com organizacao_id + dado de completar = chamada de completar mal configurada. */
export function pareceCompletar(body: unknown): boolean {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
 const b = body as Record<string, unknown>;
 const tem = (k: string) => b[k] !== undefined && b[k] !== null && b[k] !== '';
 return b.acao === 'listar_organizacoes_incompletas' && tem('organizacao_id') && CAMPOS_COMPLETAR.some(tem);
}
/** Drop optional noise; preserve mandatory fields for strict validation. */
export function normalizarBody(body: unknown, hojeBRT = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), avisos: string[] = []): unknown {
 if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
 const resultado: Record<string, unknown> = {};
 for (const [campo, original] of Object.entries(body)) {
  let valor = typeof original === 'string' ? original.trim() : original;
  if (valor === null || valor === undefined || (campo !== 'visitada' && vazioSemantico(valor)) || valor === '' || (Array.isArray(valor) && valor.length === 0)) {
   if (CAMPOS_AVISO_VAZIO.includes(campo) && typeof valor === 'string' && valor) avisos.push(`Campo ${campo.replace(/_/g, ' ')} tratado como vazio ("${valor.slice(0, 30)}"): não gravado.`);
   continue;
  }
  if (campo === 'objecoes' && Array.isArray(valor)) { valor = valor.filter(item => item != null && !vazioSemantico(item)); if (valor.length === 0) continue; }
  if (campo === 'sacos_safra') valor = sacosBR(valor);
  if (campo === 'proximo_passo_data' || campo === 'descobrir_ate' || campo === 'visita_em') valor = dataProximoPasso(valor, hojeBRT);
  if (campo === 'pessoa_telefone') valor = telefoneBR(valor);
  if (campo === 'descartar_motivo') valor = motivoDescarteBR(valor);
  if (campo === 'sugerir_visita') valor = booleanoBR(valor);
  if (valor === undefined) { avisos.push(`Campo ${campo.replace(/_/g, ' ')} descartado: valor inválido ou data passada.`); continue; }
  if (campo === 'valor' && typeof valor === 'string') valor = numeroBR(valor) ?? valor;
  if (campo === 'interesse' && typeof valor === 'string') valor = valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (campo === 'uf' && typeof valor === 'string') valor = ufBR(valor) ?? valor.toUpperCase();
  if (campo === 'criar') { valor = normalizarCriar(valor, avisos); if (valor === undefined) continue; }
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