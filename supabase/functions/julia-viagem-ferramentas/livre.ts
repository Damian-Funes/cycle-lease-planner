// Modo livre (ligação recebida sem viagem): ações permitidas e frases. Puro e testável.
export const ACOES_SO_LIVRES = ['registrar_contato_cliente', 'listar_atividades_vencidas', 'resolver_atividade', 'criar_compromisso'] as const;
/** Sem viagem só vale isto; registrar_visita, registrar_pernoite, vincular_organizacao, agendar_retorno e listar_pendentes ficam bloqueadas. */
export const ACOES_LIVRES: string[] = [...ACOES_SO_LIVRES, 'buscar_organizacao', 'listar_organizacoes_incompletas', 'completar_organizacao', 'completar_contato'];

const ddmm = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const CANAL: Record<string, string> = { telefone: 'Ligação', whatsapp: 'Conversa no WhatsApp', visita: 'Visita', email: 'E-mail', outro: 'Contato' };

export function mensagemContato(empresa: string | null | undefined, canal: string, proximaData?: string | null) {
  const base = `${CANAL[canal] ?? 'Contato'} com a ${empresa || 'empresa'} salvo.`;
  return proximaData ? `${base} Próximo passo criado na agenda para ${ddmm(proximaData)}.` : base;
}

type Ativ = { titulo: string; data: string; hora?: string | null; empresa?: string | null; vencida: boolean };
export function mensagemAtividades(lista: Ativ[]) {
  if (!lista.length) return 'Nenhuma atividade vencida ou para hoje.';
  const v = lista.filter(a => a.vencida).length; const h = lista.length - v;
  const partes = [v ? `${v} vencida${v > 1 ? 's' : ''}` : '', h ? `${h} para hoje` : ''].filter(Boolean).join(' e ');
  const primeira = lista[0];
  return `Você tem ${partes}. A primeira: ${primeira.titulo}${primeira.empresa ? ` (${primeira.empresa})` : ''}, de ${ddmm(primeira.data)}.`;
}

export function faltaResolver(b: { resolucao: string; resultado?: string; nova_data?: string; motivo?: string }): string | null {
  if (b.resolucao === 'feito' && !b.resultado) return 'Informe o campo resultado (o que foi feito).';
  if ((b.resolucao === 'reagendar' || b.resolucao === 'nao_fiz') && !b.nova_data) return 'Informe o campo nova data (hoje ou futura).';
  if (b.resolucao !== 'feito' && !b.motivo) return 'Informe o campo motivo.';
  return null;
}

export function mensagemResolver(titulo: string | null | undefined, resolucao: string, novaData?: string) {
  const t = titulo || 'Atividade';
  if (resolucao === 'feito') return `${t}: concluída.`;
  if (resolucao === 'cancelar') return `${t}: cancelada.`;
  return `${t}: remarcada para ${ddmm(novaData)}.`;
}

export function mensagemCompromisso(tipo: string, data: string, hora?: string, empresa?: string | null) {
  return `${tipo}${empresa ? ` com a ${empresa}` : ''} marcada para ${ddmm(data)}${hora ? ` às ${hora}` : ' às 09:00'}.`;
}

/** completar_contato: exatamente um caminho (o SQL repete a regra). */
export function faltaCompletarContato(b: { contato_existente?: string; contato_novo_confirmado?: boolean }): string | null {
  if (b.contato_existente && b.contato_novo_confirmado) return 'Escolha um: contato já cadastrado (contato_existente) ou pessoa nova (contato_novo_confirmado), não os dois.';
  if (!b.contato_existente && b.contato_novo_confirmado !== true) return 'Diga qual contato já cadastrado foi (contato_existente) ou confirme que é pessoa nova (contato_novo_confirmado=true).';
  return null;
}

type RespCompletarContato = { pessoa_nome?: string | null; criada?: boolean; papel?: string; empresa?: string | null; levantamentos_vinculados?: number };
export function mensagemCompletarContato(r: RespCompletarContato | null) {
  const nome = r?.pessoa_nome || 'o contato';
  const ligou = (r?.levantamentos_vinculados ?? 0) > 0 ? ' e liguei ao registro de hoje' : '';
  if (r?.criada) return `Cadastrei ${nome} como contato novo${r?.empresa ? ` da ${r.empresa}` : ''}${ligou}.`;
  return r?.papel === 'decisor' ? `Pronto: ${nome} ficou marcado como decisor.` : `Pronto: usei o contato ${nome}${ligou}.`;
}
