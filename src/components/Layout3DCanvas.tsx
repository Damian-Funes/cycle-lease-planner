import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { Loader2, Box, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { LayoutItemRow } from "@/lib/layouts";

export interface Layout3DCanvasProps {
  items: LayoutItemRow[];
  pisoLarguraMm: number;
  pisoComprimentoMm: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, posXmm: number, posYmm: number, rotacaoDeg: number) => void;
  mode: "translate" | "rotate";
}

interface CanvasCtx {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  tc?: TransformControls;
  groups?: Record<string, THREE.Group>;
  onTransform?: Layout3DCanvasProps["onTransform"];
  onSelect?: Layout3DCanvasProps["onSelect"];
  dom?: HTMLCanvasElement;
  animateToView?: (theta: number, phi: number, radius?: number) => void;
}

export function Layout3DCanvas({
  items,
  pisoLarguraMm,
  pisoComprimentoMm,
  selectedId,
  onSelect,
  onTransform,
  mode,
}: Layout3DCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasCtx>({});
  const [loadingGlb, setLoadingGlb] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f4);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(20, 30, 15);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    scene.add(dir);

    const floorW = Math.max(pisoLarguraMm / 1000, 5);
    const floorH = Math.max(pisoComprimentoMm / 1000, 5);
    const floorGeom = new THREE.PlaneGeometry(floorW, floorH);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe7e5e4,
      roughness: 0.95,
      metalness: 0,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.x = floorW / 2;
    floor.position.z = floorH / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(
      Math.max(floorW, floorH),
      Math.ceil(Math.max(floorW, floorH) * 2),
      0xc0c0c0,
      0xd6d3d1,
    );
    grid.position.set(floorW / 2, 0.01, floorH / 2);
    scene.add(grid);

    const orbit = {
      theta: -Math.PI / 4,
      phi: Math.PI / 3.5,
      radius: Math.max(floorW, floorH) * 1.4,
      target: new THREE.Vector3(floorW / 2, 0, floorH / 2),
      isDragging: false,
      locked: false,
    };
    const updateCam = () => {
      camera.position.x = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.z = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      camera.position.y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
      camera.lookAt(orbit.target);
    };
    updateCam();

    const animateToView = (targetTheta: number, targetPhi: number, targetRadius?: number) => {
      const startTheta = orbit.theta;
      const startPhi = orbit.phi;
      const startRadius = orbit.radius;
      const endRadius = targetRadius ?? orbit.radius;
      const dur = 500;
      const t0 = performance.now();
      const tween = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        orbit.theta = startTheta + (targetTheta - startTheta) * ease;
        orbit.phi = startPhi + (targetPhi - startPhi) * ease;
        orbit.radius = startRadius + (endRadius - startRadius) * ease;
        if (t < 1) requestAnimationFrame(tween);
      };
      tween();
    };

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.display = "block";
    let lastMouse = { x: 0, y: 0 };
    const pt = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      const m = e as MouseEvent;
      return { x: m.clientX, y: m.clientY };
    };
    const onDown = (e: MouseEvent) => {
      if (orbit.locked) return;
      orbit.isDragging = true;
      lastMouse = pt(e);
    };
    const onMove = (e: MouseEvent) => {
      if (!orbit.isDragging || orbit.locked) return;
      const p = pt(e);
      orbit.theta -= (p.x - lastMouse.x) * 0.005;
      orbit.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbit.phi - (p.y - lastMouse.y) * 0.005));
      lastMouse = p;
    };
    const onUp = () => {
      orbit.isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (orbit.locked) return;
      e.preventDefault();
      orbit.radius = Math.max(3, Math.min(150, orbit.radius + e.deltaY * 0.02));
    };
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const tc = new TransformControls(camera, dom);
    tc.setSize(0.8);
    tc.setTranslationSnap(0.1);
    tc.setRotationSnap(THREE.MathUtils.degToRad(90));
    tc.showY = false;
    tc.setMode("translate");
    tc.addEventListener("dragging-changed", (e) => {
      orbit.locked = Boolean((e as { value: unknown }).value);
    });
    tc.addEventListener("objectChange", () => {
      const obj = tc.object;
      if (!obj || !obj.userData.itemId) return;
      const posXmm = Math.round(obj.position.x * 1000);
      const posYmm = Math.round(obj.position.z * 1000);
      const rotacaoDeg = Math.round(((obj.rotation.y * 180) / Math.PI + 360) % 360);
      ctxRef.current.onTransform?.(obj.userData.itemId, posXmm, posYmm, rotacaoDeg);
    });
    const tcAny = tc as unknown as { getHelper?: () => THREE.Object3D };
    const tcHelper = tcAny.getHelper ? tcAny.getHelper() : (tc as unknown as THREE.Object3D);
    scene.add(tcHelper);

    const viewHelperDiv = document.createElement("div");
    viewHelperDiv.style.position = "absolute";
    viewHelperDiv.style.top = "10px";
    viewHelperDiv.style.right = "10px";
    viewHelperDiv.style.width = "128px";
    viewHelperDiv.style.height = "128px";
    viewHelperDiv.style.zIndex = "10";
    viewHelperDiv.style.pointerEvents = "auto";
    mount.appendChild(viewHelperDiv);
    const viewHelper = new ViewHelper(camera, viewHelperDiv);
    viewHelperDiv.addEventListener("pointerup", (event) => {
      const vh = viewHelper as unknown as { handleClick: (e: PointerEvent) => boolean };
      if (vh.handleClick(event)) {
        setTimeout(() => {
          const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
          orbit.radius = offset.length();
          orbit.theta = Math.atan2(offset.z, offset.x);
          orbit.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / orbit.radius)));
        }, 600);
      }
    });

    const raycaster = new THREE.Raycaster();
    const mouseV = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;
    const onClickDown = (e: MouseEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onClickUp = (e: MouseEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      const dragging = (tc as unknown as { dragging?: boolean }).dragging;
      if (moved > 5 || dragging) return;
      const rect = dom.getBoundingClientRect();
      mouseV.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseV, camera);
      const groups = Object.values(ctxRef.current.groups || {}) as THREE.Object3D[];
      const hits = raycaster.intersectObjects(groups, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.itemId) obj = obj.parent;
        if (obj) ctxRef.current.onSelect?.(obj.userData.itemId as string);
      } else {
        ctxRef.current.onSelect?.(null);
      }
    };
    dom.addEventListener("mousedown", onClickDown);
    dom.addEventListener("mouseup", onClickUp);

    let raf = 0;
    const viewHelperClock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = viewHelperClock.getDelta();
      const vh = viewHelper as unknown as { animating?: boolean; update: (d: number) => void };
      if (vh.animating) vh.update(delta);
      updateCam();
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      viewHelper.render(renderer);
      renderer.autoClear = true;
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    ctxRef.current = { scene, camera, renderer, tc, groups: {}, onTransform, onSelect, dom, animateToView };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("mousedown", onClickDown);
      dom.removeEventListener("mouseup", onClickUp);
      try {
        mount.removeChild(dom);
      } catch {
        /* noop */
      }
      try {
        mount.removeChild(viewHelperDiv);
      } catch {
        /* noop */
      }
      scene.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      ctxRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pisoLarguraMm, pisoComprimentoMm]);

  useEffect(() => {
    ctxRef.current.onTransform = onTransform;
    ctxRef.current.onSelect = onSelect;
  }, [onTransform, onSelect]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.tc) return;
    c.tc.setMode(mode);
  }, [mode]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.groups) return;
    const groups = c.groups;

    const existingIds = Object.keys(groups);
    const newIds = items.map((i) => i.item_id);

    existingIds.forEach((id) => {
      if (!newIds.includes(id)) {
        const g = groups[id];
        c.scene!.remove(g);
        g.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        delete groups[id];
      }
    });

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    loader.setDRACOLoader(draco);

    items.forEach((it) => {
      const existing = groups[it.item_id];
      const w = (it.largura_mm ?? 1000) / 1000;
      const h = (it.altura_mm ?? 2000) / 1000;
      const d = (it.comprimento_mm ?? 1000) / 1000;
      const posX = (it.pos_x_mm ?? 0) / 1000;
      const posZ = (it.pos_y_mm ?? 0) / 1000;
      const rotY = ((it.rotacao ?? 0) * Math.PI) / 180;

      if (existing) {
        existing.position.set(posX, 0, posZ);
        existing.rotation.set(0, rotY, 0);
        return;
      }

      const wrapper = new THREE.Group();
      wrapper.name = it.item_id;
      wrapper.userData.itemId = it.item_id;
      wrapper.position.set(posX, 0, posZ);
      wrapper.rotation.set(0, rotY, 0);
      c.scene!.add(wrapper);
      groups[it.item_id] = wrapper;

      const buildBoxFallback = () => {
        const cor = it.cor_categoria || "#888780";
        const geom = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(cor),
          roughness: 0.65,
          metalness: 0.15,
          transparent: true,
          opacity: 0.78,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = h / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        wrapper.add(mesh);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: new THREE.Color(cor), transparent: true, opacity: 0.95 }),
        );
        edges.position.y = h / 2;
        wrapper.add(edges);
      };

      const glbUrl = (it as unknown as { modelo_3d_url?: string | null }).modelo_3d_url;
      if (glbUrl) {
        loader.load(
          glbUrl,
          (gltf) => {
            const inner = gltf.scene;
            inner.traverse((o: THREE.Object3D) => {
              const mesh = o as THREE.Mesh;
              if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });
            inner.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(inner);
            const center = new THREE.Vector3();
            box.getCenter(center);
            inner.position.x -= center.x;
            inner.position.z -= center.z;
            inner.position.y -= box.min.y;
            wrapper.add(inner);
            setLoadingGlb((p) => {
              const np = { ...p };
              delete np[it.item_id];
              return np;
            });
          },
          (xhr) => {
            if (xhr.total) {
              setLoadingGlb((p) => ({
                ...p,
                [it.item_id]: Math.round((xhr.loaded / xhr.total) * 100),
              }));
            }
          },
          () => {
            setLoadingGlb((p) => {
              const np = { ...p };
              delete np[it.item_id];
              return np;
            });
            buildBoxFallback();
          },
        );
      } else {
        buildBoxFallback();
      }
    });
  }, [items]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.tc || !c.groups) return;
    if (selectedId && c.groups[selectedId]) {
      c.tc.attach(c.groups[selectedId]);
    } else {
      c.tc.detach();
    }
  }, [selectedId]);

  const goToView = (view: "top" | "front" | "back" | "left" | "right" | "iso") => {
    const c = ctxRef.current;
    if (!c.animateToView) return;
    const floorW = Math.max(pisoLarguraMm / 1000, 5);
    const floorH = Math.max(pisoComprimentoMm / 1000, 5);
    const baseRadius = Math.max(floorW, floorH) * 1.2;
    switch (view) {
      case "top":
        c.animateToView(-Math.PI / 2, 0.05, baseRadius);
        break;
      case "front":
        c.animateToView(-Math.PI / 2, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "back":
        c.animateToView(Math.PI / 2, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "left":
        c.animateToView(Math.PI, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "right":
        c.animateToView(0, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "iso":
      default:
        c.animateToView(-Math.PI / 4, Math.PI / 3.5, baseRadius * 1.15);
        break;
    }
  };

  const btnCls =
    "px-2.5 py-1.5 text-xs font-medium rounded hover:bg-muted flex items-center gap-1.5";

  return (
    <div ref={mountRef} className="w-full h-full relative bg-stone-100">
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur border shadow-sm rounded-lg flex items-center gap-1 px-1.5 py-1 z-10">
        <button onClick={() => goToView("top")} className={btnCls} title="Vista superior">
          <ArrowDown className="w-3.5 h-3.5" /> Topo
        </button>
        <button onClick={() => goToView("front")} className={btnCls} title="Vista frontal">
          <ArrowUp className="w-3.5 h-3.5 rotate-180" /> Frente
        </button>
        <button onClick={() => goToView("back")} className={btnCls} title="Vista traseira">
          <ArrowUp className="w-3.5 h-3.5" /> Trás
        </button>
        <button onClick={() => goToView("left")} className={btnCls} title="Vista lateral esquerda">
          <ArrowLeft className="w-3.5 h-3.5" /> Esq
        </button>
        <button onClick={() => goToView("right")} className={btnCls} title="Vista lateral direita">
          <ArrowRight className="w-3.5 h-3.5" /> Dir
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button onClick={() => goToView("iso")} className={btnCls} title="Vista isométrica">
          <Box className="w-3.5 h-3.5" /> Iso
        </button>
      </div>
      {Object.keys(loadingGlb).length > 0 && (
        <div className="absolute top-3 left-3 bg-background/95 border rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs z-10">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          Carregando {Object.keys(loadingGlb).length} modelo(s)...
        </div>
      )}
    </div>
  );
}
