/** Tempo por etapa, logado uma vez por chamada (sem valores enviados). */
export class Cronometro {
 private inicio = performance.now(); private ultimo = this.inicio;
 etapas: Record<string, number> = {}; acao = 'desconhecida';
 marcar(etapa: string) { const agora = performance.now(); this.etapas[etapa] = Math.round((this.etapas[etapa] ?? 0) + agora - this.ultimo); this.ultimo = agora; }
 total() { return Math.round(performance.now() - this.inicio); }
 registrar(status: number) { console.log('julia-viagem-ferramentas tempo', JSON.stringify({ acao: this.acao, status, total_ms: this.total(), etapas: this.etapas })); }
}
