import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { tornarTransparente, restaurarOpacidade } from "../selectionTransparency";
import { descartarObjeto3D } from "../dispose";
import { criarRastreadorCargas } from "../loadTracker";
import { comDprDeCaptura } from "../captureDpr";
import { calcularShadowFit } from "../shadowFit";

function meshCom(material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
}

describe("transparência de seleção com textura compartilhada", () => {
  it("desmarcar não descarta a textura compartilhada com o original", () => {
    const textura = new THREE.Texture();
    const disposeTextura = vi.spyOn(textura, "dispose");
    const original = new THREE.MeshStandardMaterial({ map: textura });
    const mesh = meshCom(original);
    const outroMesh = meshCom(new THREE.MeshStandardMaterial({ map: textura }));
    const grupo = new THREE.Group();
    grupo.add(mesh, outroMesh);

    tornarTransparente(grupo);
    const clone = mesh.material as THREE.MeshStandardMaterial;
    expect(clone).not.toBe(original);
    expect(clone.map).toBe(textura);
    const disposeClone = vi.spyOn(clone, "dispose");

    restaurarOpacidade(grupo);

    expect(mesh.material).toBe(original);
    expect(disposeClone).toHaveBeenCalledTimes(1);
    expect(disposeTextura).not.toHaveBeenCalled();
    expect(original.map).toBe(textura);
  });

  it("teardown restaura originais antes de descartar; textura descartada uma única vez", () => {
    const textura = new THREE.Texture();
    const disposeTextura = vi.spyOn(textura, "dispose");
    const matA = new THREE.MeshStandardMaterial({ map: textura });
    const matB = new THREE.MeshStandardMaterial({ map: textura });
    const grupo = new THREE.Group();
    grupo.add(meshCom(matA), meshCom(matB));

    tornarTransparente(grupo);
    restaurarOpacidade(grupo);
    descartarObjeto3D(grupo);

    expect(disposeTextura).toHaveBeenCalledTimes(1);
  });
});

describe("rastreador de cargas", () => {
  it("mantém contagem entre efeitos e invalida callback stale", () => {
    const cargas = criarRastreadorCargas<object>();
    const a = {};
    const b = {};
    const t1 = cargas.registrar(a);
    const t2 = cargas.registrar(b);
    expect(cargas.pendentes()).toBe(2);
    expect(cargas.valido(t1, a)).toBe(true);
    expect(cargas.valido(t1, b)).toBe(false);

    // item removido: sai da contagem imediatamente
    cargas.removerPorOwner(a);
    expect(cargas.pendentes()).toBe(1);
    // callback antigo não conclui nada
    expect(cargas.concluir(t1)).toBe(false);

    expect(cargas.concluir(t2)).toBe(true);
    expect(cargas.pendentes()).toBe(0);
    // dupla conclusão não zera contagem futura
    expect(cargas.concluir(t2)).toBe(false);
  });

  it("unmount descarta todas as cargas pendentes", () => {
    const cargas = criarRastreadorCargas<object>();
    const o = {};
    const t = cargas.registrar(o);
    cargas.limpar();
    expect(cargas.pendentes()).toBe(0);
    expect(cargas.valido(t, o)).toBe(false);
  });

  it("cargas sobrepostas só enquadram uma vez, na última conclusão", () => {
    const cargas = criarRastreadorCargas<object>();
    const fit = vi.fn();
    let jaEnquadrou = false;
    const concluir = (token: number) => {
      if (!cargas.concluir(token)) return;
      if (cargas.pendentes() > 0) return;
      if (jaEnquadrou) return;
      jaEnquadrou = true;
      fit();
    };
    const t1 = cargas.registrar({});
    const t2 = cargas.registrar({});
    const t3 = cargas.registrar({});
    concluir(t2);
    concluir(t1);
    expect(fit).not.toHaveBeenCalled();
    concluir(t3);
    expect(fit).toHaveBeenCalledTimes(1);
    // re-render que registra nova carga não re-enquadra
    const t4 = cargas.registrar({});
    concluir(t4);
    expect(fit).toHaveBeenCalledTimes(1);
  });
});

describe("DPR de captura", () => {
  /** Mock com a assinatura real do three: getSize chama target.set(w, h). */
  function fakeRenderer(dpr: number, w = 800, h = 600) {
    const state = { dpr, w, h, sizes: [] as number[][] };
    return {
      state,
      getPixelRatio: () => state.dpr,
      setPixelRatio: (v: number) => {
        state.dpr = v;
      },
      getSize: (target: THREE.Vector2) => target.set(state.w, state.h),
      setSize: (a: number, b: number) => {
        state.sizes.push([a, b]);
      },
    };
  }

  it("usa DPR cheio durante a captura e restaura o visual depois", () => {
    const r = fakeRenderer(2);
    let dprDurante = 0;
    const png = comDprDeCaptura(
      r,
      3,
      () => {
        dprDurante = r.getPixelRatio();
        return "png";
      },
      new THREE.Vector2(),
    );
    expect(png).toBe("png");
    expect(dprDurante).toBe(3);
    expect(r.getPixelRatio()).toBe(2);
    expect(r.state.sizes).toEqual([[800, 600], [800, 600]]);
  });

  it("captura as 6 vistas sem perder resolução e sempre volta ao DPR visual", () => {
    const r = fakeRenderer(2);
    const alvo = new THREE.Vector2();
    const vistas = ["top", "front", "back", "left", "right", "iso"];
    const dprs: number[] = [];
    const pngs = vistas.map((v) =>
      comDprDeCaptura(
        r,
        3,
        () => {
          dprs.push(r.getPixelRatio());
          return `png:${v}`;
        },
        alvo,
      ),
    );
    expect(pngs).toEqual(vistas.map((v) => `png:${v}`));
    expect(dprs).toEqual([3, 3, 3, 3, 3, 3]);
    expect(r.getPixelRatio()).toBe(2);
    expect(r.state.sizes).toHaveLength(12);
    expect(r.state.sizes.every(([w, h]) => w === 800 && h === 600)).toBe(true);
  });

  it("restaura o DPR mesmo se a captura falhar", () => {
    const r = fakeRenderer(2);
    expect(() =>
      comDprDeCaptura(
        r,
        4,
        () => {
          throw new Error("falhou");
        },
        new THREE.Vector2(),
      ),
    ).toThrow("falhou");
    expect(r.getPixelRatio()).toBe(2);
    // tamanho reaplicado na restauração
    expect(r.state.sizes).toEqual([[800, 600], [800, 600]]);
  });

  it("não mexe no tamanho quando o DPR já é o de captura", () => {
    const r = fakeRenderer(2);
    comDprDeCaptura(r, 2, () => null, new THREE.Vector2());
    expect(r.state.sizes).toEqual([]);
    expect(r.getPixelRatio()).toBe(2);
  });
});

describe("bounds da sombra", () => {
  it("cobre todos os cantos dos bounds no espaço da luz", () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-2, 0, -3),
      new THREE.Vector3(6, 4, 5),
    );
    const fit = calcularShadowFit(box, new THREE.Vector3(10, 18, 8), 0.1);

    const cam = new THREE.OrthographicCamera(
      fit.left,
      fit.right,
      fit.top,
      fit.bottom,
      fit.near,
      fit.far,
    );
    cam.position.copy(fit.position);
    cam.lookAt(fit.target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    for (let i = 0; i < 8; i += 1) {
      const p = new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(cam);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      expect(p.z).toBeGreaterThanOrEqual(-1);
      expect(p.z).toBeLessThanOrEqual(1);
    }
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(fit.near);
  });

  it("cena maior gera frustum maior (recalculado, não fixo)", () => {
    const dir = new THREE.Vector3(10, 18, 8);
    const pequeno = calcularShadowFit(new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1)), dir);
    const grande = calcularShadowFit(new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 6, 20)), dir);
    expect(grande.right - grande.left).toBeGreaterThan(pequeno.right - pequeno.left);
  });
});
