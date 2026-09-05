import * as THREE from "three";

export interface ShadowFit {
  /** Posição da luz direcional. */
  position: THREE.Vector3;
  /** Alvo da luz (centro dos bounds). */
  target: THREE.Vector3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/**
 * Calcula a câmera ortográfica de sombra ajustada aos bounds informados,
 * medindo os 8 cantos NO ESPAÇO DA LUZ (não em mundo).
 */
export function calcularShadowFit(
  box: THREE.Box3,
  direcaoLuz: THREE.Vector3,
  margemFator = 0.1,
): ShadowFit {
  const dir = direcaoLuz.clone().normalize();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const raio = Math.max(size.length() / 2, 2);
  const margem = raio * margemFator + 0.5;

  const position = center.clone().addScaledVector(dir, raio * 2.2 + 5);

  const lookAt = new THREE.Matrix4().lookAt(position, center, new THREE.Vector3(0, 1, 0));
  const paraLuz = new THREE.Matrix4()
    .compose(
      position,
      new THREE.Quaternion().setFromRotationMatrix(lookAt),
      new THREE.Vector3(1, 1, 1),
    )
    .invert();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    p.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).applyMatrix4(paraLuz);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    const depth = -p.z;
    minD = Math.min(minD, depth);
    maxD = Math.max(maxD, depth);
  }

  const near = Math.max(0.5, minD - margem);
  return {
    position,
    target: center,
    left: minX - margem,
    right: maxX + margem,
    bottom: minY - margem,
    top: maxY + margem,
    near,
    far: Math.max(near + 1, maxD + margem),
  };
}
