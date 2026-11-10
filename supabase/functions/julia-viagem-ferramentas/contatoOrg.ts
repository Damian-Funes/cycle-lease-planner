// deno-lint-ignore-file no-explicit-any
/** Acrescenta organizacao_id explícito ao confirmar_contato, para a Júlia não reaproveitar o parada_id. */
export function comOrg(confirmar: object | null, organizacaoId?: string | null, empresa?: string | null, paradaId?: string | null) {
  if (!confirmar) return confirmar;
  return { ...confirmar, organizacao_id: organizacaoId ?? null, organizacao_nome: empresa ?? null, ...(paradaId ? { parada_id: paradaId } : {}) };
}

/**
 * Resolve a organização para completar_contato: parada_id (da viagem do vendedor) ou organizacao_id.
 * Se o organizacao_id informado for, na verdade, o ID de uma parada do vendedor, usa a organização da parada.
 */
export async function resolverOrgContato(db: any, vendedorId: string, organizacaoId?: string, paradaId?: string): Promise<string | null> {
  const daParada = async (id: string) => {
    const r = await db.from('rota_paradas').select('organizacao_id, rotas!inner(vendedor_id)').eq('id', id).maybeSingle();
    return r.data && r.data.rotas?.vendedor_id === vendedorId ? (r.data.organizacao_id as string | null) : null;
  };
  if (paradaId) { const o = await daParada(paradaId); if (o) return o; }
  if (organizacaoId) {
    const o = await db.from('organizacoes').select('id').eq('id', organizacaoId).maybeSingle();
    if (o.data) return organizacaoId;
    return await daParada(organizacaoId);
  }
  return null;
}
