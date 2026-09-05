import * as THREE from "three";

/** Ruído com semente fixa — mesma textura em toda sessão/captura. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Valor de ruído suave (grade + interpolação) numa resolução arbitrária. */
function ruidoSuave(size: number, cells: number, rand: () => number) {
  const grid: number[] = [];
  for (let i = 0; i < (cells + 1) * (cells + 1); i += 1) grid.push(rand());
  const val = (x: number, y: number) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (ax: number, ay: number) =>
      grid[(ay % (cells + 1)) * (cells + 1) + (ax % (cells + 1))];
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  return val;
}

export interface TexturasCimento {
  mapa: THREE.Texture;
  rugosidade: THREE.Texture;
  /** Lado do tile em metros — usado para calcular o `repeat`. */
  tileMetros: number;
}

/**
 * Cimento queimado procedural: manchas de cura em duas escalas + granulado fino.
 * Sem imagens externas e sem dependências; tile único reaproveitado.
 */
export function criarTexturasCimento(anisotropy = 4): TexturasCimento {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const rough = document.createElement("canvas");
  rough.width = size;
  rough.height = size;
  const rctx = rough.getContext("2d");

  if (ctx && rctx) {
    const img = ctx.createImageData(size, size);
    const rimg = rctx.createImageData(size, size);
    const rand = rng(20260905);
    // Três escalas evitam padrão obviamente repetido a olho nu
    const grande = ruidoSuave(size, 3, rand);
    const media = ruidoSuave(size, 11, rand);
    const fina = ruidoSuave(size, 43, rand);
    const grao = rng(7);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n =
          (grande(x, y) - 0.5) * 0.55 +
          (media(x, y) - 0.5) * 0.3 +
          (fina(x, y) - 0.5) * 0.15;
        const granulado = (grao() - 0.5) * 0.045;
        // base cinza-concreto neutro, variação discreta (não "mancha")
        const base = 0.9 + n * 0.12 + granulado;
        const v = Math.max(0, Math.min(1, base));
        const i = (y * size + x) * 4;
        img.data[i] = Math.round(v * 252);
        img.data[i + 1] = Math.round(v * 250);
        img.data[i + 2] = Math.round(v * 243);
        img.data[i + 3] = 255;

        // áreas mais claras = levemente mais polidas (rugosidade menor)
        const r = Math.max(0, Math.min(1, 0.9 - n * 0.35 + granulado));
        const rv = Math.round(r * 255);
        rimg.data[i] = rv;
        rimg.data[i + 1] = rv;
        rimg.data[i + 2] = rv;
        rimg.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
  }

  const mapa = new THREE.CanvasTexture(canvas);
  mapa.colorSpace = THREE.SRGBColorSpace;
  const rugosidade = new THREE.CanvasTexture(rough);
  [mapa, rugosidade].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
  });

  return { mapa, rugosidade, tileMetros: 4 };
}

/** Ajusta o `repeat` das texturas à escala física do piso (em metros). */
export function ajustarRepeticaoCimento(
  texturas: TexturasCimento,
  larguraM: number,
  comprimentoM: number,
) {
  const rx = Math.max(1, larguraM / texturas.tileMetros);
  const ry = Math.max(1, comprimentoM / texturas.tileMetros);
  texturas.mapa.repeat.set(rx, ry);
  texturas.rugosidade.repeat.set(rx, ry);
  texturas.mapa.needsUpdate = true;
  texturas.rugosidade.needsUpdate = true;
}
