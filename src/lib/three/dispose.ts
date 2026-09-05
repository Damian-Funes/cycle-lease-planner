import * as THREE from "three";

/**
 * Texturas referenciadas por um material (ignora `envMap`, que normalmente é
 * o PMREM compartilhado da cena).
 */
export function texturasDoMaterial(material: THREE.Material): THREE.Texture[] {
  const rec = material as unknown as Record<string, unknown>;
  const out: THREE.Texture[] = [];
  Object.keys(rec).forEach((key) => {
    if (key === "envMap") return;
    const value = rec[key];
    if (value && (value as THREE.Texture).isTexture) out.push(value as THREE.Texture);
  });
  return out;
}

/**
 * Libera geometrias, materiais e texturas de uma subárvore.
 * Recursos compartilhados (mesma geometria/material/textura em vários meshes)
 * são liberados uma única vez.
 */
export function descartarObjeto3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const lista = Array.isArray(mat) ? mat : mat ? [mat] : [];
    lista.forEach((m) => {
      if (!m) return;
      materials.add(m);
      texturasDoMaterial(m).forEach((t) => textures.add(t));
    });
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

/** Remove do pai (se houver) e libera os recursos. */
export function removerEDescartar(object: THREE.Object3D | null | undefined) {
  if (!object) return;
  object.parent?.remove(object);
  descartarObjeto3D(object);
}

/** Libera o shadow map de uma luz (se já tiver sido alocado). */
export function descartarSombraDaLuz(light: THREE.Light) {
  const shadow = (light as THREE.DirectionalLight).shadow;
  shadow?.map?.dispose();
  (light as THREE.DirectionalLight).dispose?.();
}
