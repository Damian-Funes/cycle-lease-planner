import * as THREE from "three";

const OPACITY_SELECIONADO = 0.35;

type MatLike = THREE.Material & {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

export function tornarTransparente(object: THREE.Object3D, opacity = OPACITY_SELECIONADO) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (mesh.userData.originalOpacity !== undefined) return;

    const mat = mesh.material as MatLike;
    if (!mat || Array.isArray(mat)) return;

    const cloned = mat.clone() as MatLike;
    mesh.material = cloned;

    mesh.userData.originalOpacity = mat.opacity;
    mesh.userData.originalTransparent = mat.transparent;
    mesh.userData.originalDepthWrite = mat.depthWrite;
    mesh.userData.transparenciaClonada = true;

    cloned.transparent = true;
    cloned.opacity = opacity;
    cloned.depthWrite = false;
    cloned.needsUpdate = true;
  });
}

export function restaurarOpacidade(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (mesh.userData.originalOpacity === undefined) return;

    const mat = mesh.material as MatLike;
    mat.opacity = mesh.userData.originalOpacity;
    mat.transparent = mesh.userData.originalTransparent;
    mat.depthWrite = mesh.userData.originalDepthWrite;
    mat.needsUpdate = true;

    delete mesh.userData.originalOpacity;
    delete mesh.userData.originalTransparent;
    delete mesh.userData.originalDepthWrite;
    delete mesh.userData.transparenciaClonada;
  });
}

export function descartarMaterialClonado(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (mesh.userData.transparenciaClonada) {
      const mat = mesh.material as THREE.Material;
      mat.dispose?.();
    }
  });
}
