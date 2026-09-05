import type * as THREE from "three";

/**
 * Subconjunto do WebGLRenderer usado aqui. `getSize` segue a assinatura real
 * do three (`target.set(width, height)`), sem casts que escondam incompatibilidade.
 */
export type RendererDprLike = Pick<
  THREE.WebGLRenderer,
  "getPixelRatio" | "setPixelRatio" | "getSize" | "setSize"
>;

/**
 * Executa `fn` com o DPR de captura (resolução cheia) e SEMPRE restaura o DPR
 * visual depois — inclusive quando `fn` lança.
 */
export function comDprDeCaptura<T>(
  renderer: RendererDprLike,
  dprCaptura: number,
  fn: () => T,
  tamanho: THREE.Vector2,
): T {
  const dprVisual = renderer.getPixelRatio();
  try {
    renderer.getSize(tamanho);
    if (dprCaptura !== dprVisual) {
      renderer.setPixelRatio(dprCaptura);
      renderer.setSize(tamanho.x, tamanho.y);
    }
    return fn();
  } finally {
    if (renderer.getPixelRatio() !== dprVisual) {
      renderer.setPixelRatio(dprVisual);
      renderer.setSize(tamanho.x, tamanho.y);
    }
  }
}

/**
 * Limita o DPR de captura para o buffer não passar de `maxLado` px por lado.
 * Safari/iOS perde o contexto WebGL (tela branca) quando o drawing buffer
 * excede o máximo suportado — nesse caso a captura vira PNG vazio.
 */
export function dprSeguroDeCaptura(
  dprDesejado: number,
  largura: number,
  altura: number,
  maxLado = 4096,
): number {
  const lado = Math.max(largura, altura);
  if (!Number.isFinite(dprDesejado) || dprDesejado <= 0) return 1;
  if (lado <= 0) return dprDesejado;
  const limite = maxLado / lado;
  return Math.max(1, Math.min(dprDesejado, limite));
}

/** Heurística: data URL PNG minúsculo/ausente indica captura em branco. */
export function capturaParecemVazia(dataUrl: string | null | undefined): boolean {
  if (!dataUrl) return true;
  if (!dataUrl.startsWith("data:image/png")) return true;
  return dataUrl.length < 2000;
}
