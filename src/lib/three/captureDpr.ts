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
