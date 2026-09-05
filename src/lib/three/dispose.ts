import * as THREE from "three";

/**
 * Libera texturas de um material (sem tocar em recursos compartilhados
 * fora do objeto, como o environment map da cena).
 */
export function descartarMaterial(material: THREE.Material) {
  const rec = material as unknown as Record<string, unknown>;
  Object.keys(rec).forEach((key) => {
    const value = rec[key];
    if (value && (value as THREE.Texture).isTexture) {
      // envMap costuma ser compartilhado (PMREM da cena) — não descartar aqui.
      if (key === "envMap") return;
      (value as THREE.Texture).dispose();
    }
  });
  material.dispose();
}

/**
 * Libera geometrias e materiais/texturas de uma subárvore.
 * Geometrias/materiais compartilhados são liberados só uma vez.
 */
export function descartarObjeto3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m && materials.add(m));
    else if (mat) materials.add(mat);
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => descartarMaterial(m));
}

/** Remove do pai (se houver) e libera os recursos. */
export function removerEDescartar(object: THREE.Object3D | null | undefined) {
  if (!object) return;
  object.parent?.remove(object);
  descartarObjeto3D(object);
}
