export interface RendererDprLike {
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
  getSize(target: { x: number; y: number }): { x: number; y: number };
  setSize(width: number, height: number): void;
}

/**
 * Executa `fn` com o DPR de captura (resolução cheia) e SEMPRE restaura o DPR
 * visual depois — inclusive quando `fn` lança.
 */
export function comDprDeCaptura<T>(
  renderer: RendererDprLike,
  dprCaptura: number,
  fn: () => T,
): T {
  const dprVisual = renderer.getPixelRatio();
  const tamanho = renderer.getSize({ x: 0, y: 0 });
  const trocou = dprCaptura !== dprVisual;
  if (trocou) {
    renderer.setPixelRatio(dprCaptura);
    renderer.setSize(tamanho.x, tamanho.y);
  }
  try {
    return fn();
  } finally {
    if (renderer.getPixelRatio() !== dprVisual) {
      renderer.setPixelRatio(dprVisual);
      renderer.setSize(tamanho.x, tamanho.y);
    }
  }
}
