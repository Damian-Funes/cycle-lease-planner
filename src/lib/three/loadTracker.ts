/**
 * Rastreamento de cargas assíncronas (GLB) estável entre re-renderizações.
 *
 * Vive no contexto da cena (não no escopo de um useEffect), para que um
 * re-render durante o carregamento não zere a contagem nem dispare
 * enquadramento prematuro, e para que callbacks antigos possam validar
 * identidade (token + dono) antes de mexer na cena.
 */
export interface RastreadorCargas<Owner = unknown> {
  /** Registra uma carga e devolve o token. */
  registrar(owner: Owner): number;
  /** Token ainda ativo e pertencente ao mesmo dono? */
  valido(token: number, owner: Owner): boolean;
  /** Conclui a carga. Retorna false se o token já não era válido (callback stale). */
  concluir(token: number): boolean;
  /** Remove todas as cargas de um dono (ex.: item removido do layout). */
  removerPorOwner(owner: Owner): number;
  /** Descarta todas as cargas (ex.: cena desmontada). */
  limpar(): void;
  /** Cargas ainda pendentes. */
  pendentes(): number;
}

export function criarRastreadorCargas<Owner = unknown>(): RastreadorCargas<Owner> {
  const cargas = new Map<number, Owner>();
  let seq = 0;

  return {
    registrar(owner) {
      seq += 1;
      cargas.set(seq, owner);
      return seq;
    },
    valido(token, owner) {
      return cargas.has(token) && cargas.get(token) === owner;
    },
    concluir(token) {
      return cargas.delete(token);
    },
    removerPorOwner(owner) {
      let n = 0;
      cargas.forEach((v, k) => {
        if (v === owner) {
          cargas.delete(k);
          n += 1;
        }
      });
      return n;
    },
    limpar() {
      cargas.clear();
    },
    pendentes() {
      return cargas.size;
    },
  };
}
