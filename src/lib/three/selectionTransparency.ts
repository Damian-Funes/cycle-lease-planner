import * as THREE from "three";
import { descartarMaterial } from "./dispose";

const OPACITY_SELECIONADO = 0.35;

type MatLike = THREE.Material & {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

interface MeshUserData {
  materialOriginal?: MatLike;
  transparenciaClonada?: boolean;
}

export function tornarTransparente(object: THREE.Object3D, opacity = OPACITY_SELECIONADO) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;

    const ud = mesh.userData as MeshUserData;
    if (ud.materialOriginal) return;

    const mat = mesh.material as MatLike;
    if (!mat || Array.isArray(mat)) return;

    const cloned = mat.clone() as MatLike;
    ud.materialOriginal = mat;
    ud.transparenciaClonada = true;
    mesh.material = cloned;

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

    const ud = mesh.userData as MeshUserData;
    const original = ud.materialOriginal;
    if (!original) return;

    const clone = mesh.material as THREE.Material | undefined;
    mesh.material = original;
    original.needsUpdate = true;

    if (ud.transparenciaClonada && clone && clone !== original) {
      descartarMaterial(clone);
    }

    delete ud.materialOriginal;
    delete ud.transparenciaClonada;
  });
}

/** Usado ao remover o objeto da cena: libera o clone e devolve o material original. */
export function descartarMaterialClonado(object: THREE.Object3D) {
  restaurarOpacidade(object);
}
